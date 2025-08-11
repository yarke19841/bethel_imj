// src/pages/admin/CreateUser.jsx
import { useState } from "react";

export default function CreateUser() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("leader");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON}` },
        body: JSON.stringify({ email, full_name: fullName, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error creando usuario");
      setMsg("Usuario invitado por correo. Revisa perfiles para asignaciones.");
      setEmail(""); setFullName("");
    } catch (err) {
      setMsg(String(err.message));
    }
  }

  return (
    <form onSubmit={submit} style={{maxWidth: 420}}>
      <h3>Crear líder/pastor</h3>
      <input placeholder="Nombre completo" value={fullName} onChange={e=>setFullName(e.target.value)} />
      <input placeholder="Correo" value={email} onChange={e=>setEmail(e.target.value)} />
      <select value={role} onChange={e=>setRole(e.target.value)}>
        <option value="leader">Líder</option>
        <option value="pastor">Pastor</option>
      </select>
      <button>Crear e invitar</button>
      {msg && <p>{msg}</p>}
    </form>
  );
}
