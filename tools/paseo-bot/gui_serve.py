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
                # 1 s while a manager reply is pending (chat latency), 3 s otherwise; a newly
                # queued request ends the wait at once instead of sitting out the interval.
                try:
                    pause = 10 if c.busy() else 30
                    seen = c.queued_ids()
                except Exception:
                    pause, seen = 30, None
                for i in range(pause):
                    if not running or (i % 10 == 0 and stop_requested(args.state, 'gui_serve')):
                        running = False
                        break
                    time.sleep(.1)
                    if seen is not None and i % 2 == 1:
                        try:
                            if c.queued_ids() - seen:
                                break
                        except Exception:
                            seen = None
    finally:
        c.close()


if __name__ == '__main__':
    main()
