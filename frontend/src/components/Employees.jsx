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
  cardno: 0
};

const Employees = ({ onBack }) => {
  const [empleados, setEmpleados] = useState([]);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingSync, setLoadingSync] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  const fetchEmpleados = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/empleados`);
      setEmpleados(res.data);
    } catch (err) { toast.error("No se pudo cargar el personal"); }
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
      cardno: empleado.cardno || 0
    });
    setCurrentId(empleado.id);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await axios.put(`${API_URL}/api/reloj/usuarios/${form.uid_reloj}`, {
            userId: form.uid_reloj,
            name: form.nombre,
            password: form.password,
            role: form.role,
            cardno: form.cardno
        });
        await axios.put(`${API_URL}/api/empleados/${currentId}`, {
            ...form,
            rol_reloj: form.role,
            sincronizado_reloj: true
        });
        toast.success("Empleado y Reloj actualizados");
      } else {
        // Crear en DB
        const res = await axios.post(`${API_URL}/api/empleados`, form);
        const nuevoEmpleado = res.data;
        
        // Intentar mandar al Reloj inmediatamente
        try {
            await axios.put(`${API_URL}/api/reloj/usuarios/${form.uid_reloj}`, {
                userId: form.uid_reloj,
                name: form.nombre,
                password: form.password,
                role: form.role,
                cardno: form.cardno
            });
            // Si tiene éxito, marcar como sincronizado
            await axios.put(`${API_URL}/api/empleados/${nuevoEmpleado.id}`, { sincronizado_reloj: true });
            toast.success("Empleado creado y enviado al reloj");
        } catch (syncErr) {
            toast.warning("Empleado creado en DB, pero el reloj no respondió. Usa el botón azul para reintentar luego.");
        }
      }
      setShowModal(false);
      fetchEmpleados();
    } catch (err) { toast.error("Error en la operación"); }
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
      toast.success("Eliminado de la web y del reloj");
      setShowConfirm(false);
    } catch (err) { toast.error("No se pudo eliminar"); }
  };

  const enviarAlReloj = async (empleado) => {
    try {
      setLoadingSync(empleado.id);
      await axios.put(`${API_URL}/api/reloj/usuarios/${empleado.uid_reloj}`, {
          userId: empleado.uid_reloj,
          name: empleado.nombre,
          role: 0,
          password: "",
          cardno: 0
      });
      await axios.put(`${API_URL}/api/empleados/${empleado.id}`, { sincronizado_reloj: true });
      fetchEmpleados();
      toast.success("Sincronizado con el hardware");
    } catch (err) { toast.error("Error de conexión"); }
    finally { setLoadingSync(null); }
  };

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
    fetchAdmins();
  }, []);

  return (
    <div className="p-8 font-sans bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <button onClick={onBack} className="text-blue-600 mb-6 flex items-center font-bold hover:underline">
          <ArrowLeft className="mr-2" /> Volver al Panel
        </button>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Gestión de Personal</h1>
            <p className="text-gray-500 font-medium">Administra los usuarios de la base de datos y sincronízalos con el K14</p>
          </div>
          <div className="flex gap-3">
            <button onClick={importarDesdeReloj} disabled={loadingImport} className="bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-bold flex items-center shadow-sm hover:bg-gray-50 transition-all">
              <Download size={20} className="mr-2 text-blue-600" /> {loadingImport ? "Importando..." : "Importar del Reloj"}
            </button>
            <button onClick={openCreateModal} className="bg-gray-900 text-white px-5 py-2.5 rounded-xl font-bold flex items-center shadow-lg hover:bg-black transition-all">
              <UserPlus size={20} className="mr-2" /> Nuevo Empleado
            </button>
          </div>
        </div>

        {/* Banner de Admins */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-8 flex items-center gap-3 shadow-sm">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
                <ShieldCheck size={20} />
            </div>
            <span className="font-bold text-gray-800 mr-2 text-sm uppercase tracking-wider">Admins K14:</span>
            <div className="flex flex-wrap gap-2">
                {admins.map(a => (
                    <span key={a.userId} className="bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black border border-blue-100 italic">
                        {a.name} (ID: {a.userId})
                    </span>
                ))}
            </div>
        </div>

        {/* Tabla Estilizada */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">ID Reloj</th>
                <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Nombre Completo</th>
                <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Cargo / DNI</th>
                <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest text-center">Rol Reloj</th>
                <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Estado Reloj</th>
                <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {empleados.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/80 transition-colors group">
                  <td className="px-8 py-6 font-black text-gray-900 text-lg">{e.uid_reloj}</td>
                  <td className="px-8 py-6 font-bold text-gray-800">{e.nombre}</td>
                  <td className="px-8 py-6">
                    <p className="text-sm font-bold text-gray-600">{e.cargo || "Sin cargo"}</p>
                    <p className="text-xs text-gray-400">{e.dni || "---"}</p>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${e.rol_reloj === 14 ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                        {e.rol_reloj === 14 ? "Admin" : "Usuario"}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                     <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${e.sincronizado_reloj ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {e.sincronizado_reloj ? <CheckCircle size={12}/> : <XCircle size={12}/>}
                        {e.sincronizado_reloj ? "Sincronizado" : "Solo Web"}
                     </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditModal(e)} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                        <Pencil size={18} />
                      </button>
                      <button onClick={() => enviarAlReloj(e)} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                        <Send size={18} />
                      </button>
                      <button onClick={() => confirmDelete(e)} className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm">
                        <Trash2 size={18} />
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
                    <h2 className="text-2xl font-black">{isEditing ? "Editar Perfil" : "Nuevo Empleado"}</h2>
                    <p className="text-gray-400 text-sm font-medium">Configuración de base de datos y hardware</p>
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
                <div className="col-span-2 mt-4 pt-6 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-6">
                        <Settings2 size={18} className="text-blue-600" />
                        <h3 className="font-black text-gray-800 text-sm uppercase">Hardware K14</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Rol</label>
                            <select className="w-full p-3 bg-gray-50 border rounded-xl font-bold text-sm" value={form.role} onChange={e => setForm({...form, role: parseInt(e.target.value)})}>
                                <option value={0}>Usuario #0</option>
                                <option value={14}>Admin #14</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">ZK Password <span className="text-gray-300 font-medium">(Opcional)</span></label>
                            <input type="password" placeholder="Solo números" className="w-full p-3 bg-gray-50 border rounded-xl font-bold text-sm" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Nº Tarjeta <span className="text-gray-300 font-medium">(Opcional)</span></label>
                            <input type="number" placeholder="ID Tarjeta RF" className="w-full p-3 bg-gray-50 border rounded-xl font-bold text-sm" value={form.cardno} onChange={e => setForm({...form, cardno: e.target.value ? parseInt(e.target.value) : 0})} />
                        </div>
                    </div>
                </div>
              </div>
              <div className="mt-10 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-6 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black hover:bg-gray-200 transition-all">Cancelar</button>
                <button type="submit" className="flex-[2] px-6 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center">
                    <Save size={20} className="mr-2" /> {isEditing ? "Guardar Cambios" : "Crear Empleado"}
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
                    Vas a eliminar a <span className="font-bold text-gray-900">{userToDelete?.nombre}</span>. 
                    Esta acción lo borrará tanto de la web como del **Reloj K14**.
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
