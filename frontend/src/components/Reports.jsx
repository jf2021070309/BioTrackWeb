import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import ExcelJS from 'exceljs';
import { 
  Search, 
  FileDown, 
  Calendar, 
  Filter, 
  User, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Download
} from 'lucide-react';
import { saveAs } from 'file-saver';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const COLORS = {
  Puntual: '#2563eb', // blue-600
  Tarde: '#f59e0b',   // amber-500
  Incompleto: '#f97316', // orange-500
  Falta: '#ef4444'    // red-500
};

const Reports = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const [filters, setFilters] = useState({
    startDate: firstDayOfMonth,
    endDate: today
  });

  const fetchReports = async () => {
    setLoading(true);
    try {
      // Corregido: Usar /api/asistencias con parámetros desde/hasta
      const response = await axios.get(`${API_URL}/api/asistencias`, {
        params: {
          desde: filters.startDate,
          hasta: filters.endDate
        }
      });
      setData(response.data);
      setError(null);
    } catch (err) {
      console.error("Error fetching reports:", err);
      setError("No se pudieron cargar los datos del reporte.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filters.startDate, filters.endDate]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const nameMatch = (item.Empleado?.nombre || '').toLowerCase().includes(searchTerm.toLowerCase());
      return nameMatch;
    });
  }, [data, searchTerm]);

  // Chart Data Preparation
  const chartData = useMemo(() => {
    const dailyStats = {};
    const stateCounts = { Puntual: 0, Tarde: 0, Incompleto: 0, Falta: 0 };

    filteredData.forEach(item => {
      // Daily trend
      if (!dailyStats[item.fecha]) {
        dailyStats[item.fecha] = { fecha: item.fecha, Asistencias: 0, Tardanzas: 0 };
      }
      dailyStats[item.fecha].Asistencias += 1;
      
      const estado = getEstadoLabel(item);
      if (estado === 'Tarde') dailyStats[item.fecha].Tardanzas += 1;
      
      // Pie chart
      if (stateCounts[estado] !== undefined) {
        stateCounts[estado] += 1;
      }
    });

    const trend = Object.values(dailyStats).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const pie = Object.keys(stateCounts)
      .filter(key => stateCounts[key] > 0)
      .map(key => ({ name: key, value: stateCounts[key] }));

    return { trend, pie };
  }, [filteredData]);

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Asistencias');

    // 1. Título (Fondo Amarillo - FFFF00)
    const now = new Date().toLocaleDateString('es-PE');
    const titleRow = worksheet.addRow([`REPORTE DE ASISTENCIA - GENERADO EL: ${now}`]);
    
    worksheet.mergeCells('A1:H1');
    titleRow.getCell(1).font = { bold: true, size: 12, name: 'Calibri' };
    titleRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' } // Amarillo puro
    };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.getCell(1).border = {
      top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
    };
    titleRow.height = 30;

    // 2. Encabezados (Fondo Verde Lima - 92D050)
    const headerRow = worksheet.addRow(['Empleado', 'UID Reloj', 'Fecha', 'Entrada', 'Salida', 'Horas Totales', 'Estado']);
    
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, name: 'Calibri', size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF92D050' } // Verde Lima exacto
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
    headerRow.height = 20;

    // 3. Datos (Con bordes negros)
    filteredData.forEach(item => {
      const row = worksheet.addRow([
        item.Empleado?.nombre || 'N/A',
        item.uid_reloj,
        item.fecha,
        formatTime(item.hora_entrada),
        formatTime(item.hora_salida),
        item.horas_totales || '0.00',
        getEstadoLabel(item)
      ]);
      
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
        cell.alignment = { vertical: 'middle', horizontal: cell.column === 1 ? 'left' : 'center' };
      });
    });

    // 4. Ajustar anchos
    worksheet.getColumn(1).width = 30;
    worksheet.getColumn(2).width = 12;
    worksheet.getColumn(3).width = 25;
    worksheet.getColumn(4).width = 15;
    worksheet.getColumn(5).width = 12;
    worksheet.getColumn(6).width = 12;
    worksheet.getColumn(7).width = 15;
    worksheet.getColumn(8).width = 15;

    // 5. Descargar
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Reporte_Asistencia_${now}.xlsx`);
  };

  function getEstadoLabel(a) {
    if (!a.hora_entrada) return "Falta";
    if (!a.hora_salida) return "Incompleto";
    if (a.minutos_tardanza > 0) return "Tarde";
    return "Puntual";
  }

  function formatTime(isoString) {
    if (!isoString) return "--:--";
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-PE', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  }

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Puntual': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'Tarde': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'Incompleto': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'Falta': return 'bg-red-50 text-red-600 border-red-100';
      default: return 'bg-gray-50 text-gray-600 border-gray-100';
    }
  };

  return (
    <div className="p-8 font-sans bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight flex items-center gap-3">
               Análisis de Gestión
            </h1>
            <p className="text-gray-500 font-medium italic mt-1">Inteligencia de asistencia y reportes avanzados</p>
          </div>

          <button
            onClick={exportToExcel}
            className="bg-black text-white px-6 py-4 rounded-2xl font-black text-sm hover:bg-gray-800 shadow-xl transition-all flex items-center justify-center hover:scale-105"
          >
            <Download size={20} className="mr-2" />
            Descargar Excel
          </button>
        </div>

        {/* Filters Panel */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-gray-100 mb-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Desde</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl font-bold text-sm focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Hasta</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-600" size={18} />
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl font-bold text-sm focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Buscar Colaborador</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Nombre o ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border-none rounded-2xl font-bold text-sm focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>

            {/* Filtro de cargos eliminado */}
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100 min-h-[400px]">
            <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest mb-8 flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-600"/> Tendencia de Asistencia
            </h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.trend} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis 
                    dataKey="fecha" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 10, fontWeight: 'bold', fill: '#9ca3af'}}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    allowDecimals={false}
                    tick={{fontSize: 10, fontWeight: 'bold', fill: '#9ca3af'}}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    labelStyle={{ fontWeight: 'black', marginBottom: '4px' }}
                    cursor={{fill: '#f8fafc'}}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                  <Bar dataKey="Asistencias" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={40} />
                  <Bar dataKey="Tardanzas" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100">
             <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest mb-8 flex items-center gap-2">
              <PieChartIcon size={16} className="text-blue-600"/> Distribución de Estados
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.pie}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {chartData.pie.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-3">
                {chartData.pie.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[entry.name] || '#94a3b8' }}></div>
                       <span className="text-xs font-black text-gray-500">{entry.name}</span>
                    </div>
                    <span className="text-sm font-black text-gray-900">{entry.value}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden">
          <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
             <div>
                <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest">Registros Detallados</h3>
                <p className="text-xs text-gray-400 mt-1 font-bold">Mostrando {filteredData.length} registros en el rango seleccionado</p>
             </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-gray-400 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-8 py-5">Empleado</th>
                  <th className="px-8 py-5 text-center">Fecha</th>
                  <th className="px-8 py-5 text-center">Entrada</th>
                  <th className="px-8 py-5 text-center">Salida</th>
                  <th className="px-8 py-5 text-center">Horas</th>
                  <th className="px-8 py-5 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm font-black text-gray-400">CARGANDO DATA...</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length > 0 ? filteredData.map((item, idx) => {
                  const status = getEstadoLabel(item);
                  return (
                    <tr key={idx} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500 font-black group-hover:bg-blue-600 group-hover:text-white transition-all">
                              {item.uid_reloj}
                           </div>
                           <p className="font-black text-gray-900">{item.Empleado?.nombre || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-center">
                         <span className="text-xs font-black text-gray-600">{item.fecha}</span>
                      </td>
                      <td className="px-8 py-6 text-center">
                         <span className="font-black text-gray-700 bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">{formatTime(item.hora_entrada)}</span>
                      </td>
                      <td className="px-8 py-6 text-center">
                         <span className={`font-black px-3 py-1 rounded-lg border ${item.hora_salida ? "text-gray-700 bg-gray-50 border-gray-100" : "text-red-400 bg-red-50 border-red-100"}`}>
                            {formatTime(item.hora_salida)}
                         </span>
                      </td>
                      <td className="px-8 py-6 text-center">
                         <span className="text-sm font-black text-blue-600">{item.horas_totales || '0.00'}h</span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border ${getStatusStyle(status)}`}>
                            {status}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="7" className="px-8 py-20 text-center">
                      <div className="max-w-xs mx-auto opacity-40">
                         <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
                         <p className="font-black text-gray-900 uppercase text-xs">Sin información</p>
                         <p className="text-xs text-gray-500 mt-2">Ajusta los filtros para ver otros periodos</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
