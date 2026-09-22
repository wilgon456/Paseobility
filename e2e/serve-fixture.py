#!/usr/bin/env python3
"""Serve the static E2E browser fixture on localhost (stdlib only).

Binds to 127.0.0.1 by default and prints the URL. This is a foreground helper
for a human-run E2E session: it is never started by the doctor or any installer,
and it is not a persistent host. Stop it with Ctrl+C when the run is finished.
"""

import argparse
import functools
import http.server
import os
import socketserver
import sys


class FixtureHTTPServer(http.server.ThreadingHTTPServer):
    """ThreadingHTTPServer bound without a reverse-DNS lookup.

    ``http.server.HTTPServer.server_bind`` calls ``socket.getfqdn(host)``, a
    reverse DNS lookup that is pointless for a local-only static fixture and can
    block until the resolver times out on hosts without working DNS. Bind the
    socket directly and derive ``server_name``/``server_port`` from the bound
    address instead; that is all the request handlers use.
    """

    def server_bind(self):
        socketserver.TCPServer.server_bind(self)
        host, port = self.server_address[:2]
        self.server_name = host
        self.server_port = port


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Serve the Paseobility E2E browser fixture on localhost.")
    parser.add_argument("--bind", default="127.0.0.1",
                        help="interface to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=0,
                        help="port to bind (default: 0, an ephemeral port)")
    parser.add_argument(
        "--dir", default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                      "browser-fixture"),
        help="directory to serve (default: e2e/browser-fixture)")
    args = parser.parse_args(argv)

    if not os.path.isdir(args.dir):
        print("[fixture] directory not found: %s" % args.dir, file=sys.stderr)
        return 2

    handler = functools.partial(http.server.SimpleHTTPRequestHandler,
                                directory=args.dir)
    try:
        with FixtureHTTPServer((args.bind, args.port), handler) as httpd:
            host, port = httpd.server_address[:2]
            print("[fixture] serving %s at http://%s:%s/" % (args.dir, host, port),
                  flush=True)
            print("[fixture] foreground only; press Ctrl+C to stop", flush=True)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[fixture] stopped")
    except OSError as error:
        print("[fixture] could not bind %s:%s: %s" % (args.bind, args.port, error),
              file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
