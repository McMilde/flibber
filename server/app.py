import os
import re
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "highscore.db")))

app = Flask(__name__)


def hent_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = hent_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS highscore (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            navn TEXT NOT NULL,
            poeng INTEGER NOT NULL,
            dato TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
        """
    )
    conn.commit()
    conn.close()


init_db()


@app.after_request
def tillat_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


def hent_topp_10():
    conn = hent_db()
    rader = conn.execute(
        "SELECT navn, poeng, dato FROM highscore ORDER BY poeng DESC, id ASC LIMIT 10"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rader]


@app.route("/api/highscore", methods=["GET"])
def api_hent_highscore():
    return jsonify(hent_topp_10())


@app.route("/api/highscore", methods=["POST", "OPTIONS"])
def api_lagre_highscore():
    if request.method == "OPTIONS":
        return "", 204

    data = request.get_json(force=True, silent=True) or {}
    navn = (data.get("navn") or "").strip()
    navn = re.sub(r"[^\w æøåÆØÅ\-.!?éÉ]", "", navn, flags=re.UNICODE)[:20].strip()
    if not navn:
        navn = "Anonym Flibber"

    try:
        poeng = int(data.get("poeng"))
    except (TypeError, ValueError):
        return jsonify({"error": "Ugyldig poengsum"}), 400
    if poeng <= 0 or poeng > 1_000_000:
        return jsonify({"error": "Ugyldig poengsum"}), 400

    conn = hent_db()
    conn.execute("INSERT INTO highscore (navn, poeng) VALUES (?, ?)", (navn, poeng))
    # Behold litt slingringsmonn i databasen (topp 50), men send alltid kun topp 10 ut.
    conn.execute(
        """
        DELETE FROM highscore WHERE id NOT IN (
            SELECT id FROM highscore ORDER BY poeng DESC, id ASC LIMIT 50
        )
        """
    )
    conn.commit()
    conn.close()
    return jsonify(hent_topp_10()), 201


@app.route("/api/highscore/_rydd_testdata", methods=["POST"])
def api_rydd_testdata():
    conn = hent_db()
    conn.execute("DELETE FROM highscore WHERE navn = ?", ("LiveTest",))
    conn.commit()
    conn.close()
    return jsonify(hent_topp_10())


@app.route("/")
def index():
    return jsonify({"status": "Flibber highscore-API kjører."})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    app.run(debug=False, host="0.0.0.0", port=port)
