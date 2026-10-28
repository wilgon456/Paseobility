#!/usr/bin/env python3
"""Explicit migration and single-writer GUI manager service, no network listener."""
import argparse
import signal
import time
from pathlib import Path
from paseo_bot import describe, lock, log_event, stop_requested
from gui_state import Conversations


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--state', type=Path, default=Path.home() / '.config/paseo-bot')
    p.add_argument('command', choices=['migrate', 'tick', 'serve'])
    args = p.parse_args()
    c = Conversations(args.state)
    try:
        if args.command == 'migrate':
            c.migrate()
            return
        running = True
        def stop(*_):
            nonlocal running
            running = False
        signal.signal(signal.SIGINT, stop)
        signal.signal(signal.SIGTERM, stop)
        with lock(args.state, 'gui-runner.lock'):
            while running:
                try:
                    c.tick()
                except Exception as error:
                    # No request is automatically replayed; the real cause goes to the private stderr log.
                    log_event(status='gui-tick-error', error=describe(error))
                if args.command == 'tick':
                    break
                for i in range(30):
                    if not running or (i % 10 == 0 and stop_requested(args.state, 'gui_serve')):
                        running = False
                        break
                    time.sleep(.1)
    finally:
        c.db.close()


if __name__ == '__main__':
    main()
