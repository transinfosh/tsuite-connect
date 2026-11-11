"""Loopback-only synthetic broker fixture for the React browser tests; no real SSH or users."""

import base64
import json
import pathlib
import sys
import tempfile
from wsgiref.simple_server import WSGIRequestHandler, make_server

root = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "console"))
import tsuite_connect_console as core
from tsuite_connect_web import WebApplication

state = tempfile.TemporaryDirectory(prefix="connect-preview-")
settings = core.Settings(
    client_id="example-client",
    client_secret="not-real-secret",
    allowed_org="transinfosh",
    allowed_team="support",
    public_url="http://127.0.0.1:8766/connect",
    state_dir=pathlib.Path(state.name),
)
app = core.Application(settings)
app.store.new_local_user_invite("operator", "Support Operator", False, "preview")
token = app.store.new_local_user_invite("support-admin", "Support Admin", True, "preview")
app.store.prepare_local_user_invite(token, core.hash_password("preview-password-123"), "JBSWY3DPEHPK3PXP")
app.store.activate_local_user_invite(token)
# QR rendering is supplied by the production qrencode dependency. This fixture
# exercises invitation UI and real TOTP verification, with a synthetic SVG image.
core.totp_qr_data_uri = lambda uri: (
    "data:image/svg+xml;base64,"
    + base64.b64encode(
        b'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/></svg>'
    ).decode()
)
sessions = {
    "012345abcdef": {
        "id": "012345abcdef",
        "customer": "acme-srm-production",
        "status": "enrolled",
        "remote_port": 22001,
        "platform": "linux",
        "created_by": "alice",
        "purpose": "检查采购数据同步",
        "tunnel_reachable": True,
    },
    "fedcba543210": {
        "id": "fedcba543210",
        "customer": "acme-srm-production",
        "status": "issued",
        "remote_port": 22002,
        "platform": "linux",
        "created_by": "alice",
    },
    "aa11bb22cc33": {
        "id": "aa11bb22cc33",
        "customer": "northwind-erp-staging",
        "status": "enrolled",
        "remote_port": 22003,
        "platform": "windows",
        "created_by": "alice",
    },
    "dd44ee55ff66": {
        "id": "dd44ee55ff66",
        "customer": "contoso-bi-production",
        "status": "issued",
        "remote_port": 22004,
        "platform": "linux",
        "created_by": "alice",
    },
}
fail_close = True
counter = 0
policy = {"idle_timeout_seconds": 21600, "minimum_seconds": 300, "maximum_seconds": 28800}


def manager(*args, **kwargs):
    global fail_close, counter
    action = args[0]
    if action == "policy-show":
        return json.dumps(policy)
    if action == "policy-set":
        if int(args[4]) != policy["idle_timeout_seconds"]:
            raise core.ConsoleError("闲置设置已变化，请重新加载后保存", code="policy_conflict", status=core.HTTPStatus.CONFLICT)
        policy["idle_timeout_seconds"] = int(args[2])
        return json.dumps(policy)
    if action == "list":
        return "\n".join(
            "\t".join(str(item[key]) for key in ("id", "customer", "status", "remote_port"))
            for item in sessions.values()
        )
    if action == "create":
        counter += 1
        item = {
            "id": f"{counter:012x}",
            "customer": args[1],
            "status": "issued",
            "platform": "linux",
            "remote_port": 22020,
            "customer_command": "echo synthetic-customer-command",
            "operator_claim_token": "synthetic-grant",
            "token": "legacy",
            "idle_timeout_seconds": policy["idle_timeout_seconds"],
        }
        sessions[item["id"]] = item
        return json.dumps(item)
    if action == "close":
        if args[1] == "012345abcdef" and fail_close:
            fail_close = False
            raise core.ConsoleError(
                "客户侧清理未确认，连接尚未撤销。请确认客户在线并重试。",
                code="cleanup_unconfirmed",
                status=core.HTTPStatus.CONFLICT,
            )
        sessions[args[1]]["status"] = "closed"
        return ""
    if action == "set-platform":
        sessions[args[1]]["platform"] = args[2]
        sessions[args[1]]["customer_command"] = "echo synthetic-" + args[2] + "-customer-command"
    return json.dumps(sessions[args[1]])


core.manager = manager
web = WebApplication(app, core)


class Quiet(WSGIRequestHandler):
    def log_message(self, *args):
        pass


def serve(environ, respond):
    path = environ.get("PATH_INFO", "/")
    if path.startswith("/connect"):
        environ["PATH_INFO"] = path[len("/connect") :] or "/"
    return web(environ, respond)


with make_server("127.0.0.1", 8766, serve, handler_class=Quiet) as server:
    print("Connect isolated preview: http://127.0.0.1:8766/connect/", flush=True)
    server.serve_forever()
