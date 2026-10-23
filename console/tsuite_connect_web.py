"""React console and JSON API; the existing broker and client protocol stay shared."""

from __future__ import annotations

import json
import pathlib
import re
import secrets
import sys
import urllib.parse
from http import HTTPStatus


class WebApplication:
    def __init__(self, application, core):
        self.application = application
        self.core = core
        self.store = application.store
        self.settings = application.settings
        self.static_root = pathlib.Path(__file__).resolve().parent / "static"

    def json(self, respond, value, status=HTTPStatus.OK, headers=()):
        body = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
        respond(
            f"{status.value} {status.phrase}",
            [
                ("Content-Type", "application/json; charset=utf-8"),
                ("Content-Length", str(len(body))),
                ("Cache-Control", "no-store"),
                ("X-Content-Type-Options", "nosniff"),
                ("X-Frame-Options", "DENY"),
                ("Referrer-Policy", "no-referrer"),
                *headers,
            ],
        )
        return [body]

    def cookie(self, name, value, path="/connect", age=None, strict=False):
        age = self.settings.session_ttl_seconds if age is None else age
        return (
            "Set-Cookie",
            f"{name}={value}; Path={path}; Secure; HttpOnly; SameSite={'Strict' if strict else 'Lax'}; Max-Age={age}",
        )

    def commands(self, created, customer, purpose, operator_platform="linux", grant=None):
        session_id = str(created["id"])
        command = created.get("customer_command")
        if not isinstance(command, str):
            raise self.core.ConsoleError("远程会话服务未返回客户接入命令")
        if grant is None and isinstance(created.get("operator_claim_token"), str):
            grant = json.dumps(
                {"id": session_id, "token": created["operator_claim_token"], "url": self.settings.public_url},
                separators=(",", ":"),
            )
        result = {
            "id": session_id,
            "customer": customer,
            "purpose": purpose,
            "platform": created.get("platform", "linux"),
            "customer_command": command,
            "operator_platform": operator_platform,
            "grant": grant,
        }
        if grant:
            operator, _, _ = self.core.operator_command(self.settings.public_url, grant, operator_platform)
            result["operator_command"] = operator
            result["ai_instructions"] = self.core.operator_ai_instructions(
                customer, purpose, session_id, operator_platform, result["platform"], operator
            )
        return result

    def invite_info(self, token):
        invite = self.store.local_user_invite(token)
        if invite is None:
            raise self.core.ConsoleError("邀请链接无效或已过期，请联系管理员重新生成。")
        result = {"username": invite["username"], "step": "password"}
        if invite["password_hash"] and invite["totp_secret"]:
            secret = str(invite["totp_secret"])
            uri = (
                "otpauth://totp/"
                + urllib.parse.quote(f"TSuite:{invite['username']}")
                + "?"
                + urllib.parse.urlencode({"secret": secret, "issuer": "TSuite"})
            )
            result.update(step="totp", secret=secret, uri=uri, qr=self.core.totp_qr_data_uri(uri))
        return result

    def api(self, environ, respond, path):
        core = self.core
        method = environ.get("REQUEST_METHOD", "GET")
        _, session = self.application.require_session(environ)
        if path == "/api/bootstrap" and method == "GET":
            user = (
                None
                if session is None
                else {
                    key: session[key]
                    for key in ("login", "name", "csrf", "is_admin", "auth_provider", "expires_at")
                }
            )
            return self.json(
                respond,
                {
                    "user": user,
                    "allowed_org": self.settings.allowed_org,
                    "allowed_team": self.settings.allowed_team,
                    "session_ttl_seconds": self.settings.session_ttl_seconds,
                    "local_enabled": bool(self.store.local_users()),
                },
            )
        if path == "/api/invite" and method == "GET":
            token = urllib.parse.parse_qs(environ.get("QUERY_STRING", "")).get("token", [""])[-1]
            return self.json(respond, self.invite_info(token))
        form = core.form_data(environ) if method == "POST" else {}
        if method == "POST":
            origin = environ.get("HTTP_ORIGIN")
            expected = urllib.parse.urlsplit(self.settings.public_url)
            if origin and origin != f"{expected.scheme}://{expected.netloc}":
                raise core.ConsoleError("请求来源无效，请从 Connect 页面重试。", status=HTTPStatus.FORBIDDEN)
        if path == "/login/local" and method == "POST":
            user = self.store.local_user(form.get("username", ""))
            if (
                user is None
                or not user["enabled"]
                or not core.verify_password(form.get("password", ""), user["password_hash"])
            ):
                raise core.ConsoleError(
                    "账号或密码不正确", code="invalid_credentials", status=HTTPStatus.UNAUTHORIZED
                )
            challenge = self.store.new_local_login_challenge(str(user["username"]))
            return self.json(
                respond,
                {"step": "totp"},
                headers=[
                    self.cookie(
                        "tsuite_connect_local",
                        challenge,
                        "/connect/login/local/totp",
                        core.LOCAL_LOGIN_TTL_SECONDS,
                        True,
                    )
                ],
            )
        if path == "/login/local/totp" and method == "POST":
            challenge_id = core.parse_cookie(environ.get("HTTP_COOKIE"), "tsuite_connect_local")
            challenge = self.store.local_login_challenge(challenge_id)
            if challenge is None:
                raise core.ConsoleError(
                    "身份验证已过期或尝试次数过多，请重新输入账号密码。",
                    code="challenge_expired",
                    status=HTTPStatus.UNAUTHORIZED,
                )
            user = self.store.local_user(str(challenge["login"]))
            if (
                user is None
                or not user["enabled"]
                or not core.verify_totp(str(user["totp_secret"]), form.get("totp", ""))
            ):
                self.store.fail_local_login_challenge(challenge_id)
                raise core.ConsoleError(
                    "动态验证码不正确或已过期", code="invalid_totp", status=HTTPStatus.UNAUTHORIZED
                )
            self.store.consume_local_login_challenge(challenge_id)
            session_id, _ = self.store.new_session(
                str(user["username"]), str(user["display_name"]), bool(user["is_admin"]), "local"
            )
            return self.json(
                respond,
                {"step": "complete"},
                headers=[
                    self.cookie("tsuite_connect_session", session_id),
                    self.cookie("tsuite_connect_local", "", "/connect/login/local/totp", 0, True),
                ],
            )
        if path in {"/api/invite/password", "/api/invite/totp"} and method == "POST":
            token = form.get("token", "")
            invite = self.store.local_user_invite(token)
            if invite is None:
                raise core.ConsoleError("邀请链接无效或已过期，请联系管理员重新生成。")
            if path.endswith("/password"):
                password = form.get("password", "")
                if len(password) < 16 or not secrets.compare_digest(
                    password, form.get("confirm_password", "")
                ):
                    raise core.ConsoleError("密码至少 16 位，且两次输入必须一致")
                self.store.prepare_local_user_invite(
                    token, core.hash_password(password), core.new_totp_secret()
                )
                return self.json(respond, self.invite_info(token))
            if not invite["password_hash"] or not invite["totp_secret"]:
                raise core.ConsoleError("请先设置密码，再绑定动态验证码。")
            if not core.verify_totp(str(invite["totp_secret"]), form.get("totp", "")):
                self.store.fail_local_user_invite(token)
                raise core.ConsoleError("动态验证码不正确，请检查手机时间后重试")
            self.store.activate_local_user_invite(token)
            return self.json(respond, {"step": "complete"})
        if session is None:
            raise core.ConsoleError(
                "登录已过期，请重新登录。", code="login_required", status=HTTPStatus.UNAUTHORIZED
            )
        if method == "POST" and not secrets.compare_digest(form.get("csrf", ""), str(session["csrf"])):
            raise core.ConsoleError(
                "请求校验失败，请刷新页面后重试。", code="csrf_failed", status=HTTPStatus.FORBIDDEN
            )
        if path == "/api/logout" and method == "POST":
            session_id = core.parse_cookie(environ.get("HTTP_COOKIE"), "tsuite_connect_session")
            self.store.delete_session(session_id)
            return self.json(
                respond, {"ok": True}, headers=[self.cookie("tsuite_connect_session", "", age=0)]
            )
        if path == "/api/sessions" and method == "GET":
            sessions = []
            for line in core.manager("list").splitlines():
                parts = line.split("\t")
                if len(parts) == 4 and parts[2] in core.ACTIVE_STATUSES:
                    sessions.append(dict(zip(("id", "customer", "status", "remote_port"), parts)))
            return self.json(respond, {"sessions": sessions})
        if path == "/api/session" and method == "POST":
            customer, purpose = form.get("customer", ""), form.get("purpose", "").strip()
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,47}", customer):
                raise core.ConsoleError(
                    "客户环境标识需为 1–48 位小写字母、数字或连字符，且以字母或数字开头。"
                )
            if len(purpose) > 200 or any(ord(character) < 32 for character in purpose):
                raise core.ConsoleError("支持用途最多为 200 个可见字符")
            created = json.loads(
                core.manager(
                    "create",
                    customer,
                    "--created-by",
                    str(session["login"]),
                    "--purpose",
                    purpose,
                    "--platform",
                    "linux",
                )
            )
            return self.json(respond, self.commands(created, customer, purpose))
        match = re.fullmatch(r"/api/session/([0-9a-f]{12})(?:/(close|platform))?", path)
        if match:
            target, action = match.groups()
            if action == "close" and method == "POST":
                core.manager("close", target, "--closed-by", str(session["login"]))
                return self.json(respond, {"ok": True})
            if action == "platform" and method == "POST":
                platform, operator = form.get("platform", ""), form.get("operator_platform", "")
                if platform not in {"linux", "windows"} or operator not in {"linux", "windows"}:
                    raise core.ConsoleError("请选择受支持的操作系统")
                grant = form.get("grant", "")
                value = json.loads(grant)
                if (
                    not isinstance(value, dict)
                    or value.get("id") != target
                    or not isinstance(value.get("token"), str)
                ):
                    raise core.ConsoleError("支持机授权与会话不匹配")
                # Use the trusted public URL, never the browser-supplied grant URL.
                grant = json.dumps(
                    {"id": target, "token": value["token"], "url": self.settings.public_url},
                    separators=(",", ":"),
                )
                current = json.loads(core.manager("show", target))
                if current.get("platform") != form.get("current_platform"):
                    raise core.ConsoleError("会话系统状态已变化，请刷新状态后重试。")
                changed = platform != current.get("platform")
                if changed:
                    current = json.loads(core.manager("set-platform", target, platform))
                else:
                    current["customer_command"] = form.get("customer_command", "")
                result = self.commands(
                    current, form.get("customer", ""), form.get("purpose", ""), operator, grant
                )
                result["customer_locked"] = current.get("status") == "enrolled"
                return self.json(respond, result)
            if action is None and method == "GET":
                info = json.loads(core.manager("show", target))
                fields = [
                    {
                        "key": key,
                        "label": core.DETAIL_FIELD_LABELS[key],
                        "value": core.detail_value(key, info[key]),
                    }
                    for key in core.DETAIL_FIELD_ORDER
                    if key in info
                ]
                return self.json(respond, {"id": target, "status": info.get("status"), "fields": fields})
        if path.startswith("/api/users"):
            if not session["is_admin"]:
                raise core.ConsoleError("只有管理员可以管理用户。", status=HTTPStatus.FORBIDDEN)
            if path == "/api/users" and method == "GET":
                return self.json(respond, {"users": [dict(user) for user in self.store.local_users()]})
            if path == "/api/users/invite" and method == "POST":
                username, name, role = (
                    form.get("username", ""),
                    form.get("display_name", "").strip(),
                    form.get("role", "operator"),
                )
                if not re.fullmatch(r"[A-Za-z0-9_-]{3,64}", username):
                    raise core.ConsoleError("用户名应为 3–64 位字母、数字、下划线或连字符。")
                if not name or len(name) > 80 or any(ord(character) < 32 for character in name):
                    raise core.ConsoleError("显示名称应为 1–80 个可见字符。")
                if role not in {"operator", "admin"} or self.store.local_user(username) is not None:
                    raise core.ConsoleError("角色无效或用户名已存在")
                token = self.store.new_local_user_invite(
                    username, name, role == "admin", str(session["login"])
                )
                return self.json(
                    respond,
                    {
                        "invite_url": self.settings.public_url
                        + "/invite?"
                        + urllib.parse.urlencode({"token": token})
                    },
                )
            user_match = re.fullmatch(r"/api/users/([A-Za-z0-9_-]{3,64})/(toggle|reset-totp)", path)
            if user_match and method == "POST":
                username, action = user_match.groups()
                user = self.store.local_user(username)
                if user is None:
                    raise core.ConsoleError("用户不存在")
                if action == "reset-totp":
                    token = self.store.new_local_user_totp_reset(username, str(session["login"]))
                    return self.json(
                        respond,
                        {
                            "invite_url": self.settings.public_url
                            + "/invite?"
                            + urllib.parse.urlencode({"token": token})
                        },
                    )
                if username == session["login"]:
                    raise core.ConsoleError("不能禁用当前用户")
                self.store.set_local_user_enabled(username, not bool(user["enabled"]))
                return self.json(respond, {"ok": True})
        raise core.ConsoleError("未找到此接口。", status=HTTPStatus.NOT_FOUND)

    def __call__(self, environ, respond):
        path = environ.get("PATH_INFO", "/")
        method = environ.get("REQUEST_METHOD", "GET")
        self.store.cleanup()
        if path.startswith("/api/") or (
            path in {"/login/local", "/login/local/totp"}
            and "application/json" in environ.get("HTTP_ACCEPT", "")
        ):
            try:
                return self.api(environ, respond, path)
            except (self.core.ConsoleError, ValueError, TypeError, KeyError, OSError) as error:
                known = isinstance(error, self.core.ConsoleError)
                diagnostic = (error.request_id if known else None) or secrets.token_hex(6)
                code = error.code if known else "invalid_service_response"
                # Do not log request bodies, tokens, passwords, or raw upstream exceptions.
                print(f"Connect diagnostic={diagnostic} code={code}", file=sys.stderr)
                return self.json(
                    respond,
                    {
                        "error": {
                            "code": code,
                            "message": str(error)
                            if known
                            else "服务返回的数据无效，请联系管理员检查控制服务。",
                            "request_id": diagnostic,
                        }
                    },
                    error.status if known else HTTPStatus.BAD_GATEWAY,
                )
        if path.startswith("/assets/") and method == "GET":
            target = (self.static_root / path.lstrip("/")).resolve()
            if (
                not target.is_relative_to(self.static_root.resolve())
                or not target.is_file()
                or target.suffix not in {".js", ".css", ".svg"}
            ):
                return self.application.response(respond, HTTPStatus.NOT_FOUND, b"Not found")
            content_type = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml"}[
                target.suffix
            ]
            body = target.read_bytes()
            respond(
                "200 OK",
                [
                    ("Content-Type", content_type),
                    ("Content-Length", str(len(body))),
                    ("Cache-Control", "no-store"),
                    ("X-Content-Type-Options", "nosniff"),
                ],
            )
            return [body]
        if method == "GET" and (
            path in {"/", "/users", "/invite", "/login/local/totp"}
            or re.fullmatch(r"/session/[0-9a-f]{12}", path)
        ):
            index = self.static_root / "index.html"
            if not index.is_file():
                return self.application.response(
                    respond,
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    b"Connect frontend is missing. Build frontend before installation.",
                )
            _, session = self.application.require_session(environ)
            status = HTTPStatus.OK if session is not None or path == "/invite" else HTTPStatus.UNAUTHORIZED
            # Radix scroll locking inserts a style element; authorize only this response's nonce.
            nonce = secrets.token_urlsafe(18)
            body = (
                index.read_text(encoding="utf-8")
                .replace("</head>", f'<meta name="csp-nonce" content="{nonce}"></head>')
                .encode()
            )
            return self.application.response(
                respond,
                status,
                body,
                [
                    (
                        "Content-Security-Policy",
                        f"default-src 'self'; script-src 'self'; style-src 'self' 'nonce-{nonce}'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
                    ),
                ],
            )
        return self.application(environ, respond)
