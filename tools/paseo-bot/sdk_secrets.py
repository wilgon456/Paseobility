"""Bitwarden SDK adapter. Secret values never cross a command-line boundary."""
from contextlib import contextmanager
import json
import logging
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit
from uuid import UUID

SECRET_NAME = 'paseo-bot-grok-webhook'


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


def validate_secret(value):
    if not isinstance(value, dict) or set(value) != {'url', 'key'}:
        raise ValueError('Invalid webhook secret.')
    if any(not isinstance(value[k], str) or not value[k] or len(value[k]) > 8192 for k in value):
        raise ValueError('Invalid webhook secret.')
    url = urlsplit(value['url'])
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.fragment:
        raise ValueError('Invalid webhook secret.')
    if any(ord(c) < 32 or ord(c) == 127 for c in value['url'] + value['key']):
        raise ValueError('Invalid webhook secret.')
    url.port  # Validate any explicit port without copying the URL into an error.
    value['key'].encode('latin-1')  # urllib headers must be representable on the wire.
    return value


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
    def __init__(self, config=None, client=None):
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
        found = [x for x in self.client.secrets().list(self.organization).data.data if x.key == SECRET_NAME]
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
            raise ValueError('Webhook secret missing.')
        return validate_secret(json.loads(secret.value))

    def store(self, value):
        encoded = json.dumps(validate_secret(value), ensure_ascii=False, separators=(',', ':'))
        old = self.find()
        api = self.client.secrets()
        if old:
            result = api.update(self.organization, str(old.id), SECRET_NAME, encoded, old.note, [self.project])
        else:
            result = api.create(self.organization, SECRET_NAME, encoded, '', [self.project])
        # A lost write acknowledgement is never automatically replayed.
        saved = api.get(str(result.data.id)).data
        if saved.key != SECRET_NAME or saved.value != encoded or str(saved.project_id) != self.project:
            raise ValueError('Read-back verification failed.')
