# GitHub Pages + WebXR AR Application

## Configuración para GitHub Pages

Este proyecto utiliza GitHub Pages con Git LFS para servir modelos 3D grandes.

### Archivos importantes:
- `index.html` - Aplicación WebXR principal
- `src/main.js` - Lógica de WebXR y carga de modelos
- `config.js` - Configuración de rutas de modelos
- `assets/models/` - Modelos 3D comprimidos con Draco

### Características:
- ✅ Compresión Draco para modelos 3D
- ✅ Git LFS para archivos grandes
- ✅ Fallback automático sin Draco
- ✅ Compatible con GitHub Pages
- ✅ WebXR AR para dispositivos móviles

### URL de acceso:
https://jeztorres.github.io/EXAMEN/

### Solución de problemas:
Si los modelos no cargan, el sistema automáticamente:
1. Intenta cargar con compresión Draco
2. Si falla, usa un loader de fallback
3. Muestra mensajes de error detallados en la consola