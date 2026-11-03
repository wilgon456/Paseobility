"""Bitwarden SDK adapter. Secret values never cross a command-line boundary."""
from contextlib import contextmanager
import json
import logging
import os
from pathlib import Path
import sys
from uuid import UUID

DEFAULT_NAMES = {'discord-bot': 'paseo-bot-discord-token'}


def native_standard_handles():
    # Rust on Windows uses GetStdHandle, which is separate from CRT file descriptors.
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes
        import msvcrt
        set_handle = ctypes.windll.kernel32.SetStdHandle
        set_handle.argtypes = [wintypes.DWORD, wintypes.HANDLE]
        set_handle.restype = wintypes.BOOL
        for fd, identifier in [(1, -11), (2, -12)]:
            if not set_handle(identifier & 0xffffffff, msvcrt.get_osfhandle(fd)):
                raise OSError('Cannot redirect SDK diagnostics.')


def broker_config_path():
    if os.name == 'nt':
        return Path(os.environ['APPDATA']) / 'gateOFbabylon/config.toml'
    return Path.home() / '.config/agent-auth-broker/config.toml'


def validate_discord_bot(value):
    """A Discord bot token: exactly one bounded, whitespace-free string."""
    if not isinstance(value, dict) or set(value) != {'token'}:
        raise ValueError('Invalid secret value.')
    token = value['token']
    if not isinstance(token, str) or not token or len(token) > 512:
        raise ValueError('Invalid secret value.')
    if any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in token):
        raise ValueError('Invalid secret value.')
    return value


VALIDATORS = {'discord-bot': validate_discord_bot}


def validate(kind, value):
    validator = VALIDATORS.get(kind)
    if validator is None:
        raise ValueError('Unsupported secret kind.')
    return validator(value)


@contextmanager
def silent_sdk():
    """Suppress Python and native SDK diagnostics, including exception values."""
    old = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    saved = []
    try:
        for stream in (sys.stdout, sys.stderr):
            stream.flush()
        for fd in (1, 2):
            saved.append((fd, os.dup(fd)))
        with open(os.devnull, 'wb') as null:
            for fd, _ in saved:
                os.dup2(null.fileno(), fd)
            native_standard_handles()
            yield
    finally:
        for stream in (sys.stdout, sys.stderr):
            stream.flush()
        for fd, duplicate in saved:
            os.dup2(duplicate, fd)
            os.close(duplicate)
        native_standard_handles()
        logging.disable(old)


def settings(path):
    # tomllib is deliberately lazy: the resident still runs on stdlib Python 3.9+.
    import tomllib
    c = tomllib.loads(Path(path).read_text(encoding='utf-8-sig'))['bitwarden_secrets_manager']
    if c.get('enabled') is not True:
        raise ValueError('Secrets Manager disabled.')
    project = str(UUID(c['project_id']))
    token = None
    file = Path(c['access_token_file']).expanduser()
    if file.is_symlink() or (os.name != 'nt' and file.stat().st_mode & 0o077):
        raise ValueError('Private token file required.')
    for raw in file.read_text(encoding='utf-8-sig').splitlines():
        line = raw.strip().removeprefix('export ')
        key, sep, value = line.partition('=')
        if sep and key.strip() == c['access_token_key']:
            token = value.strip()
            if len(token) > 1 and token[0] == token[-1] and token[0] in '\"\'':
                token = token[1:-1]
            break
    if not token:
        raise ValueError('Machine authentication unavailable.')
    return project, token


class Vault:
    def __init__(self, config=None, client=None, name=None, kind='discord-bot'):
        if kind not in VALIDATORS:
            raise ValueError('Unsupported secret kind.')
        if name is not None and (not isinstance(name, str) or not name or len(name) > 200):
            raise ValueError('Invalid secret name.')
        self.kind = kind
        self.name = name or DEFAULT_NAMES[kind]
        project, token = settings(config or broker_config_path())
        if client is None:
            from bitwarden_sdk import BitwardenClient
            client = BitwardenClient()
        # No SDK state_file: authentication material stays in memory.
        client.auth().login_access_token(token, None)
        token = None
        self.client = client
        self.project = project
        self.organization = str(client.projects().get(project).data.organization_id)

    def find(self):
        found = [x for x in self.client.secrets().list(self.organization).data.data if x.key == self.name]
        if len(found) > 1:
            raise ValueError('Ambiguous secret name.')
        if found:
            secret = self.client.secrets().get(str(found[0].id)).data
            if str(secret.project_id) != self.project:
                raise ValueError('Secret belongs to another project.')
            return secret
        return None

    def read(self):
        secret = self.find()
        if secret is None:
            raise ValueError('Secret missing.')
        return validate(self.kind, json.loads(secret.value))

    def store(self, value):
        encoded = json.dumps(validate(self.kind, value), ensure_ascii=False, separators=(',', ':'))
        old = self.find()
        api = self.client.secrets()
        if old:
            result = api.update(self.organization, str(old.id), self.name, encoded, old.note, [self.project])
        else:
            result = api.create(self.organization, self.name, encoded, '', [self.project])
        # A lost write acknowledgement is never automatically replayed.
        saved = api.get(str(result.data.id)).data
        if saved.key != self.name or saved.value != encoded or str(saved.project_id) != self.project:
            raise ValueError('Read-back verification failed.')
