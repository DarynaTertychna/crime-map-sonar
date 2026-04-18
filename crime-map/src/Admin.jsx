import { useState } from "react";

export default function Admin() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const upload = async () => {
    setResult(null);

    if (!file) {
      setResult({ error: "Select a CSV file first." });
      return;
    }

    const savedUser = localStorage.getItem("demoUser");
    const user = savedUser ? JSON.parse(savedUser) : null;
    const token = user?.token;

    if (!token) {
      setResult({ error: "No login token found. Login again first." });
      return;
    }

    const form = new FormData();
    form.append("file", file);

    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/admin/upload-csv", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error("Upload error:", err);
      setResult({ error: `Upload failed: ${String(err)}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "40px", fontFamily: "Arial" }}>
      <h2>Admin CSV Upload</h2>

      <input
        type="file"
        accept=".csv"
        onChange={(e) => setFile(e.target.files[0] || null)}
      />

      <button
        onClick={upload}
        style={{ marginLeft: "10px", padding: "6px 12px" }}
        disabled={loading}
      >
        {loading ? "Uploading..." : "Upload CSV"}
      </button>

      {file && (
        <div style={{ marginTop: "12px" }}>
          Selected file: <b>{file.name}</b>
        </div>
      )}

      {result && (
        <pre style={{ marginTop: "20px", background: "#eee", padding: "10px" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}