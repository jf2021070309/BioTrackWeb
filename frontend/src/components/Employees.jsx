import React, { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle,
  Download,
  Pencil,
  Fingerprint,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserPlus,
  X,
  XCircle,
  Settings2,
  UserCog,
  AlertTriangle
} from "lucide-react";

const API_URL = "http://localhost:5000";

const initialForm = {
  uid_reloj: "",
  nombre: "",
  dni: "",
  cargo: "",
  password: "",
  role: 0,
  cardno: 0,
  rol_jornada_id: "",
  hora_entrada_1: "08:00",
  hora_salida_1: "17:00",
  hora_entrada_2: "",
  hora_salida_2: "",
  tolerancia_minutos: 0
};

const Employees = ({ onBack }) => {
  const [empleados, setEmpleados] = useState([]);
  const [rolesJornada, setRolesJornada] = useState([]);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingSync, setLoadingSync] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [creating, setCreating] = useState(false);

  const fetchEmpleados = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/empleados`);
      setEmpleados(res.data);
    } catch (err) { toast.error("No se pudo cargar el personal"); }
  };

  const fetchRolesJornada = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/roles-jornada`);
      setRolesJornada(res.data);
    } catch (err) { console.error("Error al cargar horarios", err); }
  };

  const fetchAdmins = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/reloj/admins`);
      setAdmins(res.data);
    } catch (err) {}
  };

  const openCreateModal = () => {
    setForm(initialForm);
    setIsEditing(false);
    setShowModal(true);
  };

  const openEditModal = (empleado) => {
    setForm({
      uid_reloj: empleado.uid_reloj,
      nombre: empleado.nombre,
      dni: empleado.dni || "",
      cargo: empleado.cargo || "",
      password: "",
      role: empleado.rol_reloj || 0,
      cardno: empleado.cardno || 0,
      rol_jornada_id: empleado.rol_jornada_id || "",
      hora_entrada_1: empleado.RolJornada ? empleado.RolJornada.hora_entrada_1.substring(0,5) : "08:00",
      hora_salida_1: empleado.RolJornada ? empleado.RolJornada.hora_salida_1.substring(0,5) : "17:00",
      hora_entrada_2: empleado.RolJornada?.hora_entrada_2 ? empleado.RolJornada.hora_entrada_2.substring(0,5) : "",
      hora_salida_2: empleado.RolJornada?.hora_salida_2 ? empleado.RolJornada.hora_salida_2.substring(0,5) : "",
      tolerancia_minutos: empleado.RolJornada ? (empleado.RolJornada.tolerancia_minutos || 0) : 0
    });
    setCurrentId(empleado.id);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
        let payload = {
            ...form,
            rol_reloj: form.role,
            sincronizado_reloj: true
        };
        
        if (form.rol_jornada_id === "custom") {
            payload.use_custom_schedule = true;
            payload.rol_jornada_id = null;
        } else {
            payload.rol_jornada_id = form.rol_jornada_id === "" ? null : parseInt(form.rol_jornada_id, 10);
            payload.use_custom_schedule = false;
        }

        await axios.put(`${API_URL}/api/empleados/${currentId}`, payload);
        toast.success("Empleado actualizado en la web");
        setShowModal(false);
        await fetchEmpleados();
        await fetchRolesJornada();
    } catch (err) { toast.error("Error al actualizar"); }
  };

  const confirmDelete = (empleado) => {
    setUserToDelete(empleado);
    setShowConfirm(true);
  };

  const executeDelete = async () => {
    if (!userToDelete) return;
    try {
      await axios.delete(`${API_URL}/api/empleados/${userToDelete.id}`);
      fetchEmpleados();
      toast.success("Eliminado de la web");
      setShowConfirm(false);
    } catch (err) { toast.error("No se pudo eliminar"); }
  };

  // enviarAlReloj removido porque la web es solo lectura

  const importarDesdeReloj = async () => {
    setLoadingImport(true);
    try {
      await axios.post(`${API_URL}/api/importar-empleados`);
      fetchEmpleados();
      toast.success("Importación completada");
    } catch (err) { toast.error("Error al importar"); }
    finally { setLoadingImport(false); }
  };

  useEffect(() => {
    fetchEmpleados();
    fetchRolesJornada();
    fetchAdmins();
  }, []);

  return (
    <div className="p-8 font-sans bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">


        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Gestión de Personal</h1>
            <p className="text-gray-500 font-medium">Administra los usuarios de la base de datos y sincronízalos con el K14</p>
          </div>
          <div className="flex gap-3">
            <button onClick={importarDesdeReloj} disabled={loadingImport} className="bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-bold flex items-center shadow-sm hover:bg-gray-50 transition-all">
              <Download size={20} className="mr-2 text-blue-600" /> {loadingImport ? "Importando..." : "Importar del Reloj"}
            </button>
          </div>
        </div>

        {/* Banner de Admins */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-3 mb-8 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
                <div className="bg-white/10 p-2 rounded-xl text-blue-400">
                    <ShieldCheck size={18} />
                </div>
                <span className="font-bold text-white text-xs uppercase tracking-wider">Administradores del Reloj:</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
                {admins.length > 0 ? admins.map(a => (
                    <span key={a.userId} className="bg-white/10 text-gray-200 px-3 py-1 rounded-lg text-xs font-semibold backdrop-blur-sm border border-white/5">
                        {a.name} <span className="text-blue-400 ml-1">#{a.userId}</span>
                    </span>
                )) : (
                    <span className="text-gray-400 text-xs italic">Cargando...</span>
                )}
            </div>
        </div>

        {/* Tabla Estilizada */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center w-20">ID</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Personal</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Horario / Jornada</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Rol Reloj</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Sincronización</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {empleados.map(e => (
                <tr key={e.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-6 py-4 text-center font-black text-gray-400 text-sm">{e.uid_reloj}</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-800 text-sm">{e.nombre}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {e.RolJornada ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-blue-100 whitespace-nowrap">
                          {e.RolJornada.nombre}
                        </span>
                        <div className="flex flex-wrap justify-center gap-1 text-[10px] text-gray-500 font-medium">
                          <span className="bg-gray-100 px-2 py-0.5 rounded-md whitespace-nowrap border border-gray-200">
                            {e.RolJornada.hora_entrada_1?.substring(0, 5)} - {e.RolJornada.hora_salida_1?.substring(0, 5)}
                          </span>
                          {e.RolJornada.hora_entrada_2 && (
                            <span className="bg-gray-100 px-2 py-0.5 rounded-md whitespace-nowrap border border-gray-200">
                              {e.RolJornada.hora_entrada_2?.substring(0, 5)} - {e.RolJornada.hora_salida_2?.substring(0, 5)}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="bg-gray-100 text-gray-400 px-3 py-1 rounded-full text-xs font-bold italic">
                        Por defecto (08:00 AM)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${e.rol_reloj === 14 ? "bg-purple-100 text-purple-700 border border-purple-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
                        {e.rol_reloj === 14 ? "Admin" : "Usuario"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                     <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${e.sincronizado_reloj ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        {e.sincronizado_reloj ? <CheckCircle size={12}/> : <XCircle size={12}/>}
                        {e.sincronizado_reloj ? "K14 OK" : "WEB"}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center gap-1">
                      <button 
                        onClick={() => openEditModal(e)} 
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar Empleado"
                      >
                        <Pencil size={16} />
                      </button>
                      <button 
                        onClick={() => confirmDelete(e)} 
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar Empleado"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PRINCIPAL */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-gray-900 p-8 text-white flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black">Editar Perfil</h2>
                    <p className="text-gray-400 text-sm font-medium">Configuración de base de datos web</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">ID Reloj</label>
                  <input type="text" required disabled={isEditing} placeholder="Ej: 101" className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-bold transition-all disabled:opacity-50" value={form.uid_reloj} onChange={e => setForm({...form, uid_reloj: e.target.value})} />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Nombre Completo</label>
                  <input type="text" required placeholder="Ej: Juan Pérez" className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-bold transition-all" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">DNI / Identificación</label>
                  <input type="text" placeholder="DNI del empleado" className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-bold transition-all" value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Cargo / Puesto</label>
                  <select 
                    className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-bold transition-all appearance-none cursor-pointer" 
                    value={form.cargo} 
                    onChange={e => setForm({...form, cargo: e.target.value})}
                  >
                    <option value="">Seleccionar cargo...</option>
                    <option value="Conductor">Conductor</option>
                    <option value="Operador">Operador / Operadora</option>
                    <option value="Desarrollador">Desarrollador (Dev)</option>
                    <option value="Practicante">Practicante</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Horario / Jornada</label>
                  <select 
                    className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-bold transition-all appearance-none cursor-pointer" 
                    value={form.rol_jornada_id} 
                    onChange={e => {
                      const val = e.target.value;
                      let newTol = form.tolerancia_minutos;
                      if (val && val !== "custom") {
                        const selectedRole = rolesJornada.find(r => r.id === parseInt(val, 10));
                        if (selectedRole) newTol = selectedRole.tolerancia_minutos || 0;
                      }
                      setForm({...form, rol_jornada_id: val, tolerancia_minutos: newTol});
                    }}
                  >
                    <option value="custom">HORARIO PERSONALIZADO</option>
                    <option value="">Por defecto (08:00 AM)</option>
                    {rolesJornada.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest" title="Tiempo de gracia. Si cambias el valor por defecto de este rol, se creará un horario personalizado automáticamente para este empleado.">
                    Tolerancia (Minutos) 💡
                  </label>
                  <input type="number" min="0" max="60" value={form.tolerancia_minutos} onChange={e => setForm({...form, tolerancia_minutos: e.target.value})} className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-bold transition-all" placeholder="Ej: 15" />
                </div>
                
                {form.rol_jornada_id === "custom" && (
                    <div className="col-span-2 bg-blue-50/50 p-6 rounded-2xl border border-blue-100 mt-2">
                        <h4 className="text-xs font-black text-blue-800 uppercase tracking-widest mb-4 flex items-center"><Settings2 size={16} className="mr-2"/> Configurar Horas Exactas</h4>
                        
                        <div className="grid grid-cols-2 gap-6 mb-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase mb-2 block tracking-widest">Ingreso 1 (Mañana)</label>
                                <input type="time" required value={form.hora_entrada_1} onChange={e => setForm({...form, hora_entrada_1: e.target.value})} className="w-full p-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-xl outline-none font-bold shadow-sm" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase mb-2 block tracking-widest">Salida 1 (Mañana)</label>
                                <input type="time" required value={form.hora_salida_1} onChange={e => setForm({...form, hora_salida_1: e.target.value})} className="w-full p-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-xl outline-none font-bold shadow-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase mb-2 block tracking-widest">Ingreso 2 (Tarde - Opcional)</label>
                                <input type="time" value={form.hora_entrada_2} onChange={e => setForm({...form, hora_entrada_2: e.target.value})} className="w-full p-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-xl outline-none font-bold shadow-sm" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase mb-2 block tracking-widest">Salida 2 (Tarde - Opcional)</label>
                                <input type="time" value={form.hora_salida_2} onChange={e => setForm({...form, hora_salida_2: e.target.value})} className="w-full p-4 bg-white border-2 border-transparent focus:border-blue-500 rounded-xl outline-none font-bold shadow-sm" />
                            </div>
                        </div>
                    </div>
                )}
              </div>
              <div className="mt-10 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black hover:bg-gray-200 transition-all">Cancelar</button>
                <button type="submit" disabled={creating} className={`flex-[2] px-6 py-4 rounded-2xl font-black shadow-lg transition-all flex items-center justify-center ${creating ? 'bg-gray-400 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  <Save size={20} className="mr-2" /> Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {showConfirm && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex justify-center items-center p-4 z-[60]">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 text-center">
            <div className="p-8">
                <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle size={40} />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-2">¿Estás seguro?</h3>
                <p className="text-gray-500 font-medium px-4">
                    Vas a eliminar a <span className="font-bold text-gray-900">{userToDelete?.nombre}</span> de la base de datos web.
                    Esta acción NO lo borrará del Reloj K14.
                </p>
            </div>
            <div className="p-6 bg-gray-50 flex gap-3">
                <button onClick={() => setShowConfirm(false)} className="flex-1 px-6 py-4 bg-white border border-gray-200 text-gray-600 rounded-2xl font-black hover:bg-gray-100 transition-all">
                    No, cancelar
                </button>
                <button onClick={executeDelete} className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl font-black shadow-lg hover:bg-red-700 transition-all">
                    Sí, eliminar
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
