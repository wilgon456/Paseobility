"""Hardline command patterns: conservative, case-insensitive regex rules.

Only a permission prompt that matches is *prevented* (auto-denied). A tool-log
scan is *detection* after the fact; it can never be a sandbox. Keep these rules
narrow enough that ordinary development work does not trip them.
"""
import re

MAX_PATTERN = 300
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,39}\Z')

# Recursive force delete of the filesystem root, home directory or a whole
# Windows drive. Project-relative paths such as ./dist are deliberately safe.
_RM_ROOT = re.compile(
    r'\brm\s+(?=-[a-z]*r)(?=-[a-z]*f)-[a-z]+\s+(?:--\s+)?(?:"|\')?'
    r'(?:/|/\*|~/?\*?|\$home/?\*?|\$\{home\}/?\*?|[a-z]:[\\/]\*?)'
    r'(?:"|\')?(?=\s|$|[;&|])', re.I)

# :(){ :|:& };: and named-function variants.
_FORK_BOMB = re.compile(
    r'(?::\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:'
    r'|\b([a-z_][a-z0-9_]*)\s*\(\s*\)\s*\{\s*\1\s*\|\s*\1\s*&\s*;?\s*\}\s*;\s*\1)', re.I)

_DISK_FORMAT = re.compile(
    r'(?:\bmkfs(?:\.\w+)?\b'
    r'|\bformat\s+[a-z]:'
    r'|\bdiskutil\s+erasedisk\b'
    r'|\bdd\b[^\n]{0,200}?\bof\s*=\s*/dev/(?:sd|disk|nvme))', re.I)

_PIPE_TO_SHELL = re.compile(
    r'\b(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b'
    r'[^\n]{0,300}\|\s*(?:sudo\s+)?(?:sh|bash|zsh|iex|invoke-expression)\b', re.I)

# force push (or +refspec) of main/master. feature/main is not a default branch.
_FORCE_PUSH_DEFAULT = re.compile(
    r'\bgit\s+push\b[^\n]{0,200}?(?:'
    r'(?:^|\s)(?:--force(?:-with-lease)?|-f)(?=\s|$)[^\n]{0,100}?(?<![\w/.-])(?:refs/heads/)?(?:main|master)(?=\s|$|[;|&])'
    r'|(?:^|\s)\+\s*(?:refs/heads/)?(?:main|master)(?=\s|$|[;|&])'
    r'|(?<![\w/.-])(?:refs/heads/)?(?:main|master)(?=\s|$|[;|&])[^\n]{0,100}?(?:^|\s)(?:--force(?:-with-lease)?|-f)(?=\s|$)'
    r')', re.I)

_DROP_DATABASE = re.compile(
    r'(?:\bdrop\s+database\b|\bdrop\s+schema\b[^\n]{0,200}?\bcascade\b)', re.I)

# Reading a private key, cloud/gh/Bitwarden/broker credential with a reader or
# copy/upload command. grep/ls/diff are not in this list on purpose.
_SECRET_READ = re.compile(
    r'\b(?:cat|type|get-content|gc|less|more|head|tail|cp|scp|curl)\b'
    r'[^\n]{0,200}?'
    r'(?:(?:~|\$home|\$\{home\})/\.ssh/id_[^\s"\']*'
    r'|(?:~|\$home|\$\{home\})/\.aws/credentials'
    r'|(?:~|\$home|\$\{home\})/\.config/gh/hosts\.yml'
    r'|gateofbabylon|agent-auth-broker'
    r'|(?:~|\$home|\$\{home\})/\.ait/credentials)', re.I)

HARDLINE = [
    ('rm-root', _RM_ROOT),
    ('fork-bomb', _FORK_BOMB),
    ('disk-format', _DISK_FORMAT),
    ('pipe-to-shell', _PIPE_TO_SHELL),
    ('force-push-default', _FORCE_PUSH_DEFAULT),
    ('drop-database', _DROP_DATABASE),
    ('secret-read', _SECRET_READ),
]


def _name(value):
    if not isinstance(value, str) or not NAME.fullmatch(value):
        raise ValueError('Safety rule names must be 1..40 safe characters.')
    return value


def build_rules(extra=None, disabled=None):
    """Return the effective (name, compiled) rules or raise ValueError.

    ``extra`` may only add new names; ``disabled`` may turn any name off.
    Patterns are capped and must compile, so a bad private registry fails
    closed instead of silently weakening the list.
    """
    if extra is None:
        extra = []
    if disabled is None:
        disabled = []
    if not isinstance(extra, list) or len(extra) > 50:
        raise ValueError('Safety extraRules must be an array of at most 50 rules.')
    if not isinstance(disabled, list) or len(disabled) > 100:
        raise ValueError('Safety disabledRules must be an array of at most 100 names.')
    rules = list(HARDLINE)
    names = {name for name, _ in rules}
    for item in extra:
        if not isinstance(item, dict) or set(item) != {'name', 'pattern'}:
            raise ValueError('Safety extra rules need exactly name and pattern.')
        name = _name(item['name'])
        pattern = item['pattern']
        if not isinstance(pattern, str) or not pattern.strip() or len(pattern) > MAX_PATTERN:
            raise ValueError('Safety rule patterns must be 1..%d characters.' % MAX_PATTERN)
        if name in names:
            raise ValueError('Safety rule names must be unique.')
        try:
            compiled = re.compile(pattern, re.I)
        except re.error:
            raise ValueError('Safety rule pattern is invalid.') from None
        names.add(name)
        rules.append((name, compiled))
    off = set()
    for name in disabled:
        off.add(_name(name))
    return [(name, pattern) for name, pattern in rules if name not in off]


def find(text, rules=None):
    """Return (rule name, matched excerpt) for the first hit, or (None, '')."""
    if not isinstance(text, str) or not text:
        return None, ''
    for name, pattern in (rules if rules is not None else HARDLINE):
        match = pattern.search(text)
        if match:
            excerpt = match.group(0)
            return name, (excerpt if isinstance(excerpt, str) else '')[:MAX_PATTERN]
    return None, ''


def scan(text, rules=None):
    """Return the first matching rule name, or None."""
    return find(text, rules)[0]
