"""Local administrator CLI. Run as the application service account."""
import argparse
from pathlib import Path
import secrets
import sys

from backend import Settings, database, ensure_schema, password_hash


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default=Settings().db)
    sub = parser.add_subparsers(dest="command", required=True)
    for command in ("create-user", "reset-password"):
        p = sub.add_parser(command)
        p.add_argument("username")
        p.add_argument("--password-file", required=True, help="Datei oder - für stdin; Passwort nie als Argument")
        if command == "create-user":
            p.add_argument("--tenant", default="pilot")
    p = sub.add_parser("allow-email")
    p.add_argument("email")
    p.add_argument("--tenant", default="pilot")
    p = sub.add_parser("disable-user")
    p.add_argument("username")
    sub.add_parser("list-users")
    args = parser.parse_args()
    ensure_schema(args.db)
    if args.command in {"create-user", "reset-password"}:
        secret = sys.stdin.read() if args.password_file == "-" else Path(args.password_file).read_text()
        encoded = password_hash(secret.rstrip("\r\n"))
    with database(args.db) as db:
        if args.command == "create-user":
            db.execute("INSERT INTO users VALUES(?,?,?,?,1)", (secrets.token_urlsafe(18), args.username.strip().lower(), args.tenant, encoded))
        elif args.command == "allow-email":
            email = args.email.strip().lower()
            if "@" not in email or len(email) > 254:
                parser.error("Ungültige E-Mail-Adresse")
            db.execute("INSERT INTO users VALUES(?,?,?,?,1) ON CONFLICT(username) DO UPDATE SET active=1", (secrets.token_urlsafe(18), email, args.tenant, "disabled-password-login"))
        elif args.command == "reset-password":
            row = db.execute("SELECT id FROM users WHERE username=?", (args.username.strip().lower(),)).fetchone()
            if row is None:
                parser.error("Benutzer nicht gefunden")
            db.execute("UPDATE users SET password_hash=? WHERE id=?", (encoded, row["id"]))
            db.execute("DELETE FROM sessions WHERE user_id=?", (row["id"],))
        elif args.command == "disable-user":
            name = args.username.strip().lower()
            if not name or len(name) > 254:
                parser.error("Ungültiger Benutzername")
            # Preserve a ban even if the identity has not registered yet.
            # Only the explicit administrator allow-email command can undo it.
            user_id = secrets.token_urlsafe(18)
            db.execute("INSERT INTO users(id,username,tenant,password_hash,active) VALUES(?,?,?,?,0) ON CONFLICT(username) DO UPDATE SET active=0", (user_id, name, "self-" + user_id, "disabled-password-login"))
            db.execute("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username=?)", (name,))
        elif args.command == "list-users":
            for row in db.execute("SELECT username,tenant,active FROM users ORDER BY username"):
                print(f"{row['username']}\t{row['tenant']}\t{'active' if row['active'] else 'disabled'}")
    if args.command != "list-users":
        print("Benutzerverwaltung aktualisiert; keine Zugangsdaten ausgegeben.")


if __name__ == "__main__":
    main()
