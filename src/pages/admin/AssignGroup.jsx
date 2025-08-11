// src/pages/admin/AssignGroup.jsx
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AssignGroup() {
  const [leaders, setLeaders] = useState([]);
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
  const [leaderId, setLeaderId] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles")
        .select("user_id, full_name, role")
        .in("role", ["leader"]); // puedes incluir "pastor" si quieres que pastores lideren grupos
      setLeaders(data ?? []);
    })();
  }, []);

  async function createGroup(e) {
    e.preventDefault();
    const { error } = await supabase.from("groups")
      .insert({ name, zone, leader_user_id: leaderId });
    if (error) alert(error.message);
    else { alert("Grupo creado"); setName(""); setZone(""); setLeaderId(""); }
  }

  return (
    <form onSubmit={createGroup} style={{maxWidth: 520}}>
      <h3>Crear grupo y asignar líder</h3>
      <input placeholder="Nombre del grupo" value={name} onChange={e=>setName(e.target.value)} />
      <input placeholder="Zona" value={zone} onChange={e=>setZone(e.target.value)} />
      <select value={leaderId} onChange={e=>setLeaderId(e.target.value)}>
        <option value="">-- Seleccione líder --</option>
        {leaders.map(l => <option key={l.user_id} value={l.user_id}>{l.full_name}</option>)}
      </select>
      <button>Crear grupo</button>
    </form>
  );
}
