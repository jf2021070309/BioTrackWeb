CREATE DATABASE IF NOT EXISTS biotrack_db;
USE biotrack_db;

-- 1. Tabla de Roles de Jornada (Horarios)
CREATE TABLE IF NOT EXISTS roles_jornada (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    hora_entrada TIME NOT NULL,
    hora_salida TIME NOT NULL,
    tolerancia_minutos INT DEFAULT 0
);

-- 2. Tabla de Empleados (Soporta IDs como 'U01')
CREATE TABLE IF NOT EXISTS empleados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid_reloj VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    dni VARCHAR(20),
    cargo VARCHAR(50),
    rol_jornada_id INT,
    activo BOOLEAN DEFAULT TRUE,
    sincronizado_reloj BOOLEAN DEFAULT FALSE,
    fecha_sync_reloj DATETIME,
    rol_reloj INT DEFAULT 0, -- 0: Usuario, 14: Admin
    huella_registrada BOOLEAN DEFAULT FALSE,
    fecha_huella DATETIME,
    FOREIGN KEY (rol_jornada_id) REFERENCES roles_jornada(id) ON DELETE SET NULL
);

-- 3. Registros Crudos (Marcaciones directas del reloj)
CREATE TABLE IF NOT EXISTS registros_crudos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid_reloj VARCHAR(50) NOT NULL,
    timestamp DATETIME NOT NULL,
    UNIQUE KEY unique_registro (uid_reloj, timestamp)
);

-- 4. Asistencias Procesadas (Cálculos de horas y estados)
CREATE TABLE IF NOT EXISTS asistencias_procesadas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid_reloj VARCHAR(50) NOT NULL,
    fecha DATE NOT NULL,
    hora_entrada DATETIME,
    hora_salida DATETIME,
    horas_totales DECIMAL(5,2),
    cumplio_jornada BOOLEAN,
    estado ENUM('PRESENTE', 'CUMPLIO', 'TARDE', 'SALIDA_TEMPRANA', 'NO_CUMPLIO', 'INCOMPLETO', 'AUSENTE') DEFAULT 'PRESENTE',
    minutos_tardanza INT DEFAULT 0,
    minutos_salida_temprana INT DEFAULT 0,
    UNIQUE KEY unique_asistencia (uid_reloj, fecha),
    FOREIGN KEY (uid_reloj) REFERENCES empleados(uid_reloj) ON DELETE CASCADE
);

-- Insertar roles por defecto
INSERT IGNORE INTO roles_jornada (id, nombre, hora_entrada, hora_salida, tolerancia_minutos) 
VALUES (1, 'Administrativo', '08:00:00', '17:00:00', 15);

-- Insertar personal actual (Usando INSERT IGNORE para evitar duplicados si ya existen)
INSERT IGNORE INTO empleados (uid_reloj, nombre, dni, cargo, rol_reloj, sincronizado_reloj) VALUES 
('1', 'Juan Perez', '12345678', 'Analista de Sistemas', 0, TRUE),
('2', 'Maria Garcia', '87654321', 'Gerente de Proyectos', 0, TRUE),
('3', 'Jose', NULL, 'Sin cargo', 0, TRUE),
('4', 'Rafael', NULL, 'Limpieza', 0, TRUE),
('5', 'Jaime', NULL, 'Dev', 0, TRUE),
('U01', 'Andree', NULL, 'Sin cargo', 14, TRUE),
('1064095', 'Usuario 1064095', NULL, 'Sin cargo', 0, FALSE);
