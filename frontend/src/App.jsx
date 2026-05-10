import React, { useState, useEffect } from "react";
import axios from "axios";
import { Toaster, toast } from "sonner";
import Dashboard from "./components/Dashboard";
import Employees from "./components/Employees";
import Reports from "./components/Reports";

function App() {
  const [view, setView] = useState("dashboard");
  const [asistencias, setAsistencias] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [loadingSync, setLoadingSync] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingClockTime, setLoadingClockTime] = useState(false);
  const [error, setError] = useState("");

  const fetchAsistencias = async (fecha = selectedDate) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/asistencias?fecha=${fecha}`);
      setAsistencias(response.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || "Error al cargar asistencias");
    }
  };

  const syncAsistencia = async () => {
    try {
      setLoadingSync(true);
      await axios.post("http://localhost:5000/api/sync");
      fetchAsistencias();
      setError("");
      toast.success("Marcaciones sincronizadas");
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      toast.error(message);
    } finally {
      setLoadingSync(false);
    }
  };

  const importEmpleados = async () => {
    try {
      setLoadingImport(true);
      await axios.post("http://localhost:5000/api/importar-empleados");
      setError("");
      toast.success("Personal sincronizado");
    } catch (err) {
      const message = err.response?.data?.error || "Error al importar empleados";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingImport(false);
    }
  };

  const syncClockTime = async () => {
    try {
      setLoadingClockTime(true);
      await axios.post("http://localhost:5000/api/reloj/sync-hora");
      setError("");
      toast.success("Hora del reloj sincronizada");
    } catch (err) {
      const message = err.response?.data?.error || "No se pudo sincronizar la hora del reloj";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingClockTime(false);
    }
  };

  const handleDateChange = (fecha) => {
    setSelectedDate(fecha);
    fetchAsistencias(fecha);
  };

  useEffect(() => { 
    fetchAsistencias(selectedDate); 
    
    // Auto-refrescar la UI cada 60 segundos para mostrar las nuevas marcaciones automáticas
    const interval = setInterval(() => {
      fetchAsistencias(selectedDate);
    }, 60000);

    return () => clearInterval(interval);
  }, [selectedDate]);

  return (
    <div className="App min-h-screen bg-gray-50 font-sans">
      <Toaster richColors position="top-right" />
      <nav className="bg-white border-b p-4 flex justify-center space-x-8 shadow-sm">
          <button onClick={() => setView("dashboard")} className={`font-bold transition-all ${view === "dashboard" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}>Dashboard</button>
          <button onClick={() => setView("employees")} className={`font-bold transition-all ${view === "employees" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}>Personal</button>
          <button onClick={() => setView("reports")} className={`font-bold transition-all ${view === "reports" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}>Reportes</button>
      </nav>
      <div className="max-w-7xl mx-auto">
        {view === "dashboard" && (
          <Dashboard
            asistencias={asistencias}
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            onSyncAsistencia={syncAsistencia}
            onImportEmpleados={importEmpleados}
            onSyncClockTime={syncClockTime}
            loadingSync={loadingSync}
            loadingImport={loadingImport}
            loadingClockTime={loadingClockTime}
            error={error}
          />
        )}
        {view === "employees" && <Employees onBack={() => setView("dashboard")} />}
        {view === "reports" && <Reports />}
      </div>
    </div>
  );
}

export default App;
