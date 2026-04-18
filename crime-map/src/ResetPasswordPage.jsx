import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const t = params.get("token");
    if (t) {
      setToken(t);
    } else {
      setMsg("Reset token is missing from the link.");
    }
  }, [params]);

  const submit = async () => {
    setMsg("");

    if (!token) {
      setMsg("Reset token is missing.");
      return;
    }

    if (!password) {
      setMsg("New password is required.");
      return;
    }

    if (password.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMsg("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const r = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: password,
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        throw new Error(data.detail || "Reset password failed");
      }

      setMsg("Password reset successful. You can sign in now.");
      setPassword("");
      setConfirmPassword("");
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const successLike = msg.toLowerCase().includes("successful");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111418",
        color: "#fff",
        display: "grid",
        gridTemplateColumns: "1.4fr 420px",
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background:
            "radial-gradient(circle at 20% 20%, rgba(56,142,60,0.15), transparent 30%), radial-gradient(circle at 75% 70%, rgba(211,47,47,0.16), transparent 30%), linear-gradient(180deg, #171b20 0%, #0f1216 100%)",
          borderRight: "1px solid #262b31",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
            opacity: 0.3,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(17,20,24,0.15) 0%, rgba(17,20,24,0.55) 65%, rgba(17,20,24,0.9) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "72px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "18px",
            }}
          >
            <span
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                background: "#d32f2f",
                display: "inline-block",
                boxShadow: "0 0 20px rgba(211,47,47,0.6)",
              }}
            />
            <span
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                background: "#ffb300",
                display: "inline-block",
                boxShadow: "0 0 20px rgba(255,179,0,0.45)",
              }}
            />
            <span
              style={{
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                background: "#388e3c",
                display: "inline-block",
                boxShadow: "0 0 20px rgba(56,142,60,0.45)",
              }}
            />
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "4rem",
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            CrimeMap
          </h1>

          <p
            style={{
              marginTop: "18px",
              maxWidth: "520px",
              fontSize: "1.08rem",
              lineHeight: 1.6,
              color: "#b7c0c9",
            }}
          >
            Reset your account password securely and return to the platform.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          background: "#14181d",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "380px",
            background: "#1c2127",
            border: "1px solid #2b3138",
            borderRadius: "14px",
            boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "24px" }}>
            <h2 style={{ marginTop: 0, marginBottom: "18px" }}>Reset Password</h2>

            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#d6dbe0",
                  fontSize: "0.95rem",
                }}
              >
                New password
              </label>

              <div
                style={{
                  display: "flex",
                  border: "1px solid #353c45",
                  borderRadius: "6px",
                  overflow: "hidden",
                  background: "#111418",
                }}
              >
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  style={{
                    flex: 1,
                    padding: "11px 12px",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: "#fff",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  style={{
                    width: "50px",
                    border: "none",
                    borderLeft: "1px solid #353c45",
                    background: "#191e24",
                    color: "#d6dbe0",
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#d6dbe0",
                  fontSize: "0.95rem",
                }}
              >
                Confirm new password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  border: "1px solid #353c45",
                  borderRadius: "6px",
                  boxSizing: "border-box",
                  background: "#111418",
                  color: "#fff",
                  outline: "none",
                }}
              />
            </div>

            <button
              onClick={submit}
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 12px",
                border: "none",
                borderRadius: "6px",
                cursor: loading ? "default" : "pointer",
                background: "linear-gradient(90deg, #c62828 0%, #e57373 100%)",
                color: "#fff",
                fontWeight: 700,
                opacity: loading ? 0.8 : 1,
              }}
            >
              {loading ? "Please wait..." : "Reset password"}
            </button>

            {msg && (
              <div
                style={{
                  marginTop: "14px",
                  fontSize: "0.95rem",
                  color: successLike ? "#81c784" : "#ff8a80",
                  lineHeight: 1.5,
                }}
              >
                {msg}
              </div>
            )}

            <div style={{ marginTop: "18px", display: "flex", gap: "12px" }}>
              <Link to="/" style={{ color: "#9aa4ae", textDecoration: "none" }}>
                Back to login
              </Link>

              {successLike && (
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#9aa4ae",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "0.95rem",
                  }}
                >
                  Sign in now
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}