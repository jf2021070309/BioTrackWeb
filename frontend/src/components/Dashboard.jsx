import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle,
  Clock,
  Download,
  FileDown,
  RefreshCw,
  Search,
  TimerReset,
  UserCheck,
  UserX,
  Users,
  XCircle
} from "lucide-react";

const API_URL = "http://localhost:5000";

const emptyStats = {
  resumen: {
    empleadosActivos: 0,
    presentes: 0,
    ausentes: 0,
    tardanzas: 0,
    incompletos: 0,
    cumplieron: 0,
    horasPromedio: 0
  },
  tardanzas: [],
  ausentes: [],
  ultimoRegistro: null
};

const formatTime = (value) => {
  if (!value) return "--:--";
  return new Date(value).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatDateTime = (value) => {
  if (!value) return "Sin registros";
  return new Date(value).toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const getEstado = (asistencia) => {
  const estadoBackend = asistencia.estado || "PRESENTE";
  
  const map = {
    "PRESENTE": { label: "Presente", className: "bg-blue-100 text-blue-700", icon: UserCheck },
    "CUMPLIO": { label: "Cumplió", className: "bg-green-100 text-green-700", icon: CheckCircle },
    "TARDE": { label: "Tarde", className: "bg-red-100 text-red-700", icon: Clock },
    "SALIDA_TEMPRANA": { label: "Salida temprana", className: "bg-orange-100 text-orange-700", icon: TimerReset },
    "NO_CUMPLIO": { label: "Incompleto", className: "bg-amber-100 text-amber-700", icon: AlertTriangle },
    "INCOMPLETO": { label: "Falta Salida", className: "bg-amber-100 text-amber-700", icon: AlertTriangle },
    "AUSENTE": { label: "Ausente", className: "bg-red-100 text-red-700", icon: XCircle }
  };

  return map[estadoBackend] || map["PRESENTE"];
};

const formatDecimalHours = (decimal) => {
  if (!decimal || decimal === "0.00") return "00:00";
  const totalMinutes = Math.round(parseFloat(decimal) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const StatCard = ({ icon: Icon, label, value, tone }) => (
  <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-50 flex items-center gap-5 hover:shadow-2xl transition-shadow duration-300">
    <div className={`${tone} p-4 rounded-2xl flex items-center justify-center shadow-inner`}>
      <Icon size={24} strokeWidth={2.5} />
    </div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-black text-gray-900 tracking-tighter leading-none">{value}</p>
    </div>
  </div>
);

const Dashboard = ({
  asistencias = [],
  selectedDate,
  onDateChange,
  onSyncAsistencia,
  onImportEmpleados,
  onSyncClockTime,
  loadingSync,
  loadingImport,
  loadingClockTime,
  error
}) => {
  const [stats, setStats] = useState(emptyStats);
  const [statsError, setStatsError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    axios.get(`${API_URL}/api/stats?fecha=${selectedDate}`)
      .then(res => {
        setStats(res.data);
        setStatsError("");
      })
      .catch(err => {
        setStats(emptyStats);
        setStatsError(err.response?.data?.error || "No se pudieron cargar las estadisticas");
      });
  }, [selectedDate, asistencias]);

  const filteredAsistencias = useMemo(() => {
    return asistencias
      .filter(a => {
        const nombre = (a.Empleado?.nombre || "").toLowerCase();
        const uid = String(a.uid_reloj);
        const search = searchTerm.toLowerCase();
        return nombre.includes(search) || uid.includes(search);
      })
      .sort((a, b) => new Date(a.hora_entrada || 0) - new Date(b.hora_entrada || 0));
  }, [asistencias, searchTerm]);

  return (
    <div className="p-8 font-sans bg-gray-50 min-h-screen">
      {/* Header Premium */}
      <div className="max-w-7xl mx-auto mb-10">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Monitor en Tiempo Real</h1>
            <p className="text-gray-500 font-medium italic">Sincronización directa con hardware ZKTeco K14</p>
          </div>

          <div className="flex flex-wrap gap-3">
             <div className="flex items-center gap-3 bg-white border border-gray-100 p-2 rounded-2xl shadow-sm">
                <CalendarDays size={20} className="ml-2 text-blue-600" />
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => onDateChange(event.target.value)}
                    className="bg-transparent outline-none font-bold text-sm pr-4"
                />
             </div>
            
            <button
              onClick={onImportEmpleados}
              disabled={loadingImport}
              className="bg-white border border-gray-100 text-gray-700 px-5 py-3 rounded-2xl font-black text-sm hover:bg-gray-50 shadow-sm transition-all flex items-center"
            >
              <Download size={18} className="mr-2 text-blue-600" />
              {loadingImport ? "Sincronizando..." : "Sincronizar Personal"}
            </button>

            <button
              onClick={onSyncAsistencia}
              disabled={loadingSync}
              className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-blue-700 shadow-xl transition-all flex items-center hover:scale-105 active:scale-95"
            >
              <RefreshCw size={18} className={`mr-2 ${loadingSync ? "animate-spin" : ""}`} />
              {loadingSync ? "Procesando..." : "Sincronizar Marcaciones"}
            </button>
          </div>
        </div>

        {(error || statsError) && (
          <div className="mt-6 bg-red-50 border border-red-100 text-red-700 px-6 py-4 rounded-2xl text-sm font-bold flex items-center gap-3">
            <AlertTriangle size={20} /> {error || statsError}
          </div>
        )}
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Stats Cards Premium */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6 mb-10">
          <StatCard icon={Users} label="Total Activos" value={stats.resumen.empleadosActivos} tone="bg-slate-100 text-slate-700" />
          <StatCard icon={UserCheck} label="Presentes" value={stats.resumen.presentes} tone="bg-blue-50 text-blue-600" />
          <StatCard icon={UserX} label="Ausentes" value={stats.resumen.ausentes} tone="bg-red-50 text-red-600" />
          <StatCard icon={Clock} label="Tardanzas" value={stats.resumen.tardanzas} tone="bg-amber-50 text-amber-600" />
          <StatCard icon={AlertTriangle} label="Falta Salida" value={stats.resumen.incompletos} tone="bg-orange-50 text-orange-600" />
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-[2rem] shadow-xl text-white">
             <p className="text-[10px] font-black uppercase opacity-80 mb-2">Prom. Horas</p>
             <h3 className="text-3xl font-black">{stats.resumen.horasPromedio}h</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tabla Principal */}
          <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/30">
              <div>
                <h2 className="font-black text-gray-800 uppercase text-xs tracking-widest">Asistencia Diaria</h2>
                <p className="text-xs text-gray-400 mt-1 font-bold">{filteredAsistencias.length} resultados encontrados</p>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto">
                 <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Buscar empleado o ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 shadow-sm transition-all"
                    />
                 </div>
                 <div className="hidden sm:flex bg-white border border-gray-100 rounded-xl px-4 py-2 text-[10px] font-black text-gray-400 shadow-sm items-center gap-2">
                    Último: {formatDateTime(stats.ultimoRegistro).split(',')[1]}
                 </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white text-gray-400 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-8 py-5">Empleado</th>
                    <th className="px-8 py-5 text-center">Entrada</th>
                    <th className="px-8 py-5 text-center">Salida</th>
                    <th className="px-8 py-5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredAsistencias.length > 0 ? filteredAsistencias.map((a) => {
                    const estado = getEstado(a);
                    const Icon = estado.icon;

                    return (
                      <tr key={`${a.uid_reloj}-${a.fecha}`} className="hover:bg-gray-50/80 transition-colors group">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500 font-black group-hover:bg-blue-600 group-hover:text-white transition-all">
                                {a.uid_reloj}
                             </div>
                             <div>
                                <p className="font-black text-gray-900 leading-tight">{a.Empleado?.nombre || `ID: ${a.uid_reloj}`}</p>
                             </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                           <span className="font-black text-gray-700 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">{formatTime(a.hora_entrada)}</span>
                        </td>
                        <td className="px-8 py-6 text-center">
                           <span className={`font-black px-3 py-1 rounded-lg border ${a.hora_salida ? "text-gray-700 bg-gray-50 border-gray-100" : "text-red-400 bg-red-50 border-red-100"}`}>
                              {a.hora_salida ? formatTime(a.hora_salida) : "--:--"}
                           </span>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex justify-center">
                            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${estado.className}`}>
                              <Icon size={12} />
                              {estado.label}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan="4" className="px-8 py-24 text-center">
                         <div className="max-w-xs mx-auto opacity-40">
                            <CalendarDays size={48} className="mx-auto mb-4 text-gray-400" />
                            <p className="font-black text-gray-900 uppercase text-xs">No hay datos para hoy</p>
                            <p className="text-xs text-gray-500 mt-2">Sincroniza marcaciones para actualizar el panel</p>
                         </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Side Panels */}
          <div className="space-y-8">
            <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8">
              <h2 className="font-black text-gray-800 uppercase text-xs tracking-widest mb-6 flex items-center justify-between">
                <span className="flex items-center"><Clock className="mr-2 text-amber-500" size={16} /> Tardanzas</span>
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg text-[10px]">{stats.tardanzas.length}</span>
              </h2>
              <div className="space-y-4">
                {stats.tardanzas.length > 0 ? stats.tardanzas.slice(0, 5).map((t) => (
                  <div key={`${t.uid_reloj}-${t.fecha}`} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-amber-200 transition-colors">
                    <div>
                      <p className="font-black text-sm text-gray-900">{t.Empleado?.nombre || `ID: ${t.uid_reloj}`}</p>
                      <p className="text-[10px] text-amber-600 font-black uppercase tracking-tighter">Entró {formatTime(t.hora_entrada)}</p>
                    </div>
                    <span className="bg-white px-2 py-1 rounded-lg shadow-sm text-red-600 font-black text-[10px]">
                      +{t.minutos_tardanza}m
                    </span>
                  </div>
                )) : (
                  <p className="text-center text-gray-400 text-xs py-10 font-bold italic">Cero tardanzas hoy. ¡Excelente!</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-xl border border-gray-100 p-8">
              <h2 className="font-black text-gray-800 uppercase text-xs tracking-widest mb-6 flex items-center justify-between">
                 <span className="flex items-center"><UserX className="mr-2 text-red-500" size={16} /> Ausentes</span>
                 <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-lg text-[10px]">{stats.ausentes.length}</span>
              </h2>
              <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {stats.ausentes.length > 0 ? stats.ausentes.map((empleado) => (
                  <div key={empleado.uid_reloj} className="p-4 bg-red-50/50 rounded-2xl border border-red-100 flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center text-red-600 font-black text-xs">
                       {empleado.uid_reloj}
                    </div>
                    <div>
                       <p className="font-black text-xs text-gray-900">{empleado.nombre}</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-gray-400 text-xs py-10 font-bold italic">Todo el personal está presente.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
