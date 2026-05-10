import React, { useState, useEffect } from "react";
import axios from "axios";
import Dashboard from "./components/Dashboard";

function App() {
  const [asistencias, setAsistencias] = useState([]);

  // Función para obtener datos desde el Backend
  const fetchAsistencias = async () => {
    try {
      const response = await axios.get("http://localhost:5000/api/asistencias");
      setAsistencias(response.data);
    } catch (error) {
      console.error("Error al obtener asistencias:", error);
    }
  };

  // Función para pedirle al backend que sincronice con el reloj
  const syncReloj = async () => {
    try {
      await axios.post("http://localhost:5000/api/sync");
      fetchAsistencias(); // Refrescar la tabla tras sincronizar
    } catch (error) {
      alert("Error al conectar con el reloj. Revisa la IP.");
    }
  };

  useEffect(() => {
    fetchAsistencias();
  }, []);

  return (
    <div className="App">
      <Dashboard asistencias={asistencias} onSync={syncReloj} />
    </div>
  );
}

export default App;
