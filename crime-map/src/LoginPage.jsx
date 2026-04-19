import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";


export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setMsg("");
    setPassword("");
    setConfirmPassword("");
    setShowForgotPassword(false);
  };

  const submit = async () => {
    setMsg("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail) {
      setMsg("Email is required.");
      return;
    }

    if (!password) {
      setMsg("Password is required.");
      return;
    }

    if (mode === "register") {
      if (password.length < 6) {
        setMsg("Password should be at least 6 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setMsg("Passwords do not match.");
        return;
      }
    }


    setLoading(true);

    try {
      if (mode === "register") {
        const registerResponse = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            name: cleanName,
          }),
        });

        const registerData = await registerResponse.json();

        if (!registerResponse.ok) {
          throw new Error(registerData.detail || "Register failed");
        }

        setMsg("Account created. You can sign in now.");
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        return;
      }

      const loginResponse = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password,
        }),
      });



      const loginData = await loginResponse.json();

      if (!loginResponse.ok) {
        throw new Error(loginData.detail || "Login failed");
      }

      const userData = {
        id: loginData.id,
        token: loginData.access_token,
        tokenType: loginData.token_type,
        email: loginData.email,
        name: loginData.name,
        favorite_crime_type: loginData.favorite_crime_type,
        preferred_county: loginData.preferred_county,
      };


      onLogin(userData);
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const submitForgotPassword = async () => {
    setMsg("");

    try {
      const r = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await r.json();

      if (!r.ok) {
        throw new Error(data.detail || "Forgot password failed");
      }

      const message = data.message || "Reset request processed.";
      setMsg(message);
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  };



  const errorLike =
    msg.toLowerCase().includes("failed") ||
    msg.toLowerCase().includes("invalid") ||
    msg.toLowerCase().includes("required") ||
    msg.toLowerCase().includes("match");

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
            County-based crime risk analysis, map visualisation, historical trend
            tracking, and AI-assisted safety summaries.
          </p>

          <div
            style={{
              marginTop: "28px",
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {["Prediction", "County Risk Map", "Crime Trends", "AI Assistant"].map((item) => (
              <span
                key={item}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #2c333b",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.04)",
                  color: "#d6dbe0",
                  fontSize: "0.9rem",
                }}
              >
                {item}
              </span>
            ))}
          </div>
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
          <div style={{ display: "flex", borderBottom: "1px solid #2b3138" }}>
            <button
              type="button"
              data-testid="tab-sign-in"
              onClick={() => switchMode("login")}
              style={{
                flex: 1,
                padding: "14px 12px",
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                background: mode === "login" ? "#1c2127" : "#232931",
                color: mode === "login" ? "#ffffff" : "#b7c0c9",
                borderTop: mode === "login" ? "3px solid #d32f2f" : "3px solid transparent",
              }}
            >
              Sign In
            </button>

            <button
              type="button"
              data-testid="tab-create-account"
              onClick={() => switchMode("register")}
              style={{
                flex: 1,
                padding: "14px 12px",
                border: "none",
                cursor: "pointer",
                fontWeight: 700,
                background: mode === "register" ? "#1c2127" : "#232931",
                color: mode === "register" ? "#ffffff" : "#b7c0c9",
                borderTop: mode === "register" ? "3px solid #d32f2f" : "3px solid transparent",
              }}
            >
              Create Account
            </button>
          </div>

          <div style={{ padding: "24px" }}>
            {mode === "register" && (
              <div style={{ marginBottom: "14px" }}>
                <label
                  htmlFor="register-name"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    color: "#d6dbe0",
                    fontSize: "0.95rem",
                  }}
                >
                  Name
                </label>
                <input
                  id="register-name"
                  name="name"
                  data-testid="register-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
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
            )}

            <div style={{ marginBottom: "14px" }}>
              <label
                htmlFor="auth-email"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#d6dbe0",
                  fontSize: "0.95rem",
                }}
              >
                Email
              </label>
              <input
                id="auth-email"
                name="email"
                data-testid="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
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

            <div style={{ marginBottom: "14px" }}>
              <label
                htmlFor="auth-password"
                style={{
                  display: "block",
                  marginBottom: "6px",
                  color: "#d6dbe0",
                  fontSize: "0.95rem",
                }}
              >
                Password
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
                  id="auth-password"
                  name="password"
                  data-testid="auth-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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
                  title={showPassword ? "Hide password" : "Show password"}
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

            {mode === "register" && (
              <div style={{ marginBottom: "16px" }}>
                <label
                  htmlFor="register-confirm-password"
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    color: "#d6dbe0",
                    fontSize: "0.95rem",
                  }}
                >
                  Confirm Password
                </label>
                <input
                  id="register-confirm-password"
                  name="confirmPassword"
                  data-testid="register-confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
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
            )}

            <button
              type="button"
              data-testid={mode === "login" ? "sign-in-button" : "create-account-button"}
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
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign In"
                : "Create Account"}
            </button>

            {mode === "login" && (
              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  data-testid="toggle-forgot-password"
                  style={{
                    marginTop: "14px",
                    background: "none",
                    border: "none",
                    color: "#9aa4ae",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                  }}
                  onClick={() => {
                    setShowForgotPassword((prev) => !prev);
                    setMsg("");
                  }}
                >
                  {showForgotPassword ? "Hide password reset" : "Forgot your password?"}
                </button>
              </div>
            )}



            {mode === "login" && showForgotPassword && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  border: "1px solid #353c45",
                  borderRadius: "8px",
                  background: "#151a20",
                }}
              >
                <div style={{ marginBottom: "10px", color: "#d6dbe0", fontWeight: 600 }}>
                  Password reset
                </div>

                <div style={{ marginBottom: "10px" }}>
                  <label
                    htmlFor="forgot-email"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      color: "#d6dbe0",
                    }}
                  >
                    Email
                  </label> 
                  <input
                    id="forgot-email"
                    name="forgotEmail"
                    data-testid="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your account email"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #353c45",
                      borderRadius: "6px",
                      boxSizing: "border-box",
                      background: "#111418",
                      color: "#fff",
                    }}
                  />
                </div>

                  <button
                    type="button"
                    data-testid="send-reset-link"
                    onClick={submitForgotPassword}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      background: "#2b3138",
                      color: "#fff",
                      marginBottom: "12px",
                    }}
                  >
                    Send reset link
                  </button>
              </div>
            )}


            {msg && (
              <div
                style={{
                  marginTop: "14px",
                  fontSize: "0.92rem",
                  color: errorLike ? "#ff8a80" : "#81c784",
                }}
              >
                {msg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}