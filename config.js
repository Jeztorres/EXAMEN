// Configuración para optimización móvil
const CONFIG = {
    // Tiempos de espera
    LOAD_TIMEOUT: 30000, // 30 segundos
    
    // Calidad de renderizado
    MAX_PIXEL_RATIO: {
        mobile: 2,
        desktop: 3
    },
    
    // FOV de cámara
    CAMERA_FOV: {
        mobile: 60,
        desktop: 70
    },
    
    // Configuración de renderer
    RENDERER: {
        antialias: {
            mobile: false, // Desactivar en móviles para mejor rendimiento
            desktop: true
        },
        powerPreference: {
            mobile: 'default',
            desktop: 'high-performance'
        }
    },
    
    // Rutas de modelos (fácil de modificar) - Usando versiones comprimidas con Draco
    MODELS: {
        1: './assets/models/modelo-final.glb',
        2: './assets/models/movimiento2.glb',
        3: './assets/models/movimiento3.glb'
    },
    
    // Configuración específica para WebXR AR
    AR: {
        // Características requeridas para AR
        requiredFeatures: ['hit-test'],
        // Características opcionales para mejor experiencia
        optionalFeatures: ['dom-overlay', 'light-estimation'],
        // Configuración del overlay DOM
        domOverlay: { root: null }, // Se asignará dinámicamente
        // Configuración de sesión AR
        sessionInit: {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay', 'light-estimation']
        }
    },
    
    // Configuración de modelos 3D
    MODEL: {
        defaultScale: { x: 0.3, y: 0.3, z: 0.3 },
        defaultRotation: { x: 0, y: 0, z: 0 },
        // Distancia mínima para colocar modelos
        minDistance: 0.5,
        maxDistance: 10
    },
    
    // Debug
    AUTO_SHOW_LOGS_ON_MOBILE: true,
    MAX_LOGS: 15
};

// Exportar configuración
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}