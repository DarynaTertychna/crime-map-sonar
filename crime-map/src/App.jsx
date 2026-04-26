import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import HomePage from "./HomePage";
import LoginPage from "./LoginPage";
import ResetPasswordPage from "./ResetPasswordPage";
import Admin from "./Admin.jsx";

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("demoUser");
    return saved ? JSON.parse(saved) : null;
  });

  const onLogin = (data) => {
    setUser(data);
    localStorage.setItem("demoUser", JSON.stringify(data));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("demoUser");
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          user ? (
            <HomePage user={user} onLogout={logout} />
          ) : (
            <LoginPage onLogin={onLogin} />
          )
        }
      />

      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/admin"
        element={
          user?.email === "darinayg@gmail.com" ? (
            <Admin />
          ) : (
            <LoginPage onLogin={onLogin} />
          )
        }
      />
    </Routes>
  );
}