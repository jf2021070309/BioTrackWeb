import React, { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Lock, LogIn } from "lucide-react";

const Login = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await axios.post("http://localhost:5000/api/login", { password });
      onLoginSuccess();
      toast.success("Acceso autorizado");
    } catch (err) {
      toast.error("Contraseña incorrecta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-blue-600 p-8 text-center">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
            <Lock className="text-white w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-white">Acceso Restringido</h2>
          <p className="text-blue-100 mt-2 font-medium">Panel de Administración BioTrack</p>
        </div>
        <form onSubmit={handleSubmit} className="p-8">
          <div className="mb-6">
            <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Contraseña de Administrador</label>
            <input 
              type="password" 
              autoFocus
              placeholder="••••••••" 
              className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-bold transition-all text-center text-xl tracking-widest"
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>
          <button 
            type="submit" 
            disabled={loading || !password} 
            className={`w-full py-4 rounded-2xl font-black shadow-lg transition-all flex items-center justify-center ${loading || !password ? 'bg-gray-400 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            {loading ? "Verificando..." : <><LogIn className="mr-2" size={20} /> Ingresar al Panel</>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
