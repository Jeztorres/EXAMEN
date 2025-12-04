// src/main.js

import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


let camera, scene, renderer;
let controller;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let currentModel = null;
let orbitControls; // Controles para modo web
let isARMode = false; // Estado actual del modo
const clock = new THREE.Clock();

// Sistema de logs para depuración móvil
const logs = [];
function log(message) {
    console.log(message);
    logs.push(`${new Date().toLocaleTimeString()}: ${message}`);
    if (logs.length > 10) logs.shift(); // Mantener solo los últimos 10
    updateLogDisplay();
}

let debugVisible = false;

function updateLogDisplay() {
    let logDiv = document.getElementById('debug-logs');
    if (!logDiv) {
        logDiv = document.createElement('div');
        logDiv.id = 'debug-logs';
        logDiv.style.cssText = `
            position: fixed;
            top: 50px;
            left: 10px;
            right: 10px;
            background: rgba(0,0,0,0.9);
            color: #00ff00;
            padding: 8px;
            font-size: 10px;
            font-family: monospace;
            border-radius: 4px;
            z-index: 1000;
            max-height: 150px;
            overflow-y: auto;
            pointer-events: none;
            display: none;
            border: 1px solid #00ff00;
        `;
        document.body.appendChild(logDiv);
    }
    
    if (debugVisible) {
        logDiv.style.display = 'block';
        logDiv.innerHTML = logs.join('<br>');
    } else {
        logDiv.style.display = 'none';
    }
}

function toggleDebug() {
    debugVisible = !debugVisible;
    updateLogDisplay();
    
    const debugBtn = document.getElementById('debug-toggle');
    if (debugBtn) {
        debugBtn.style.background = debugVisible ? 
            'rgba(0, 255, 0, 0.7)' : 
            'rgba(100, 100, 100, 0.7)';
    }
    
    log(`Debug logs ${debugVisible ? 'mostrados' : 'ocultos'}`);
}

// Configurar loaders con compresión Draco y fallback
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
dracoLoader.setDecoderConfig({ type: 'js' });

// Loader principal con Draco
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

// Loader de fallback sin Draco para GitHub Pages
const fallbackLoader = new GLTFLoader();

// Usar configuración externa (con fallback)
const MODELS = (window.CONFIG && window.CONFIG.MODELS) || {
    1: './assets/models/modelo-final.glb',
    2: './assets/models/movimiento2.glb',
    3: './assets/models/movimiento3.glb'
};

let currentMode = 1;

let loadingModels = {}; // Cache para evitar múltiples cargas del mismo modelo
let preloadedModels = {}; // Modelos precargados

const statusEl = document.getElementById('status');
const loadingIndicator = document.getElementById('loading-indicator');
const cameraControls = document.getElementById('camera-controls');// Funciones de UI
function showLoading(message = 'Cargando...') {
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
        const textEl = loadingIndicator.querySelector('div:last-child');
        if (textEl) textEl.textContent = message;
    }
}

function hideLoading() {
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

// Precargar modelos al inicio
async function preloadModels() {
    log('Iniciando precarga de modelos...');
    showLoading('Precargando modelos 3D...');
    
    let loadedCount = 0;
    const totalModels = Object.keys(MODELS).length;
    
    for (const [mode, url] of Object.entries(MODELS)) {
        try {
            log(`Precargando modelo ${mode}: ${url}`);
            showLoading(`Precargando modelo ${mode}/${totalModels}...`);
            await preloadModel(url, mode);
            loadedCount++;
            log(`Modelo ${mode} precargado (${loadedCount}/${totalModels})`);
        } catch (error) {
            log(`Error precargando modelo ${mode}: ${error.message}`);
            // Continuar con los demás modelos aunque uno falle
        }
    }
    
    hideLoading();
    log(`Precarga completada: ${loadedCount}/${totalModels} modelos cargados`);
    
    if (loadedCount === 0) {
        statusEl.textContent = 'Error: No se pudieron cargar los modelos. Verifica tu conexión.';
        log('ERROR: Ningún modelo se pudo precargar');
    } else if (loadedCount < totalModels) {
        statusEl.textContent = `${loadedCount}/${totalModels} modelos cargados. Toca el piso para colocar modelo 👇`;
    } else {
        statusEl.textContent = 'Todos los modelos cargados. Toca el piso para colocar modelo 👇';
    }
}

function preloadModel(url, mode) {
    return new Promise((resolve, reject) => {
        if (preloadedModels[mode]) {
            resolve(preloadedModels[mode]);
            return;
        }

        loader.load(
            url,
            (gltf) => {
                preloadedModels[mode] = gltf;
                log(`Modelo ${mode} precargado exitosamente`);
                resolve(gltf);
            },
            (progress) => {
                const percent = Math.round((progress.loaded / progress.total) * 100);
                log(`Precargando modelo ${mode}: ${percent}%`);
            },
            (error) => {
                log(`Error precargando modelo ${mode}: ${error.message}`);
                reject(error);
            }
        );
    });
}

// Inicializar modo web normal
function initializeWebMode() {
    log('Iniciando en modo web...');
    isARMode = false;
    
    const isDesktop = !/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Mostrar controles de cámara
    if (cameraControls) {
        cameraControls.style.display = 'block';
    }
    
    // Ocultar retículo en modo web
    reticle.visible = false;
    
    // Configurar controles adicionales para PC
    if (isDesktop) {
        setupDesktopFeatures();
    }
    
    // Cargar modelo por defecto con escala apropiada para el dispositivo
    const defaultPosition = new THREE.Vector3(0, 0, 0);
    const defaultRotation = new THREE.Quaternion();
    const defaultScale = new THREE.Vector3(
        isDesktop ? 0.7 : 0.5,
        isDesktop ? 0.7 : 0.5,
        isDesktop ? 0.7 : 0.5
    );
    
    loadModelForCurrentMode(defaultPosition, defaultRotation, defaultScale);
    
    const deviceText = isDesktop ? 'PC' : 'móvil';
    statusEl.textContent = `Modo web activo en ${deviceText}. Selecciona una rutina para ver la animación.`;
    log('Modo web inicializado para ' + deviceText);
}

// Configuraciones específicas para PC
function setupDesktopFeatures() {
    log('Configurando características para PC...');
    
    // Doble clic para centrar vista
    renderer.domElement.addEventListener('dblclick', () => {
        if (currentModel && !isARMode) {
            // Centrar cámara en el modelo
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            const maxDim = Math.max(size.x, size.y, size.z);
            const distance = maxDim * 2.5;
            
            camera.position.set(distance, distance * 0.5, distance);
            camera.lookAt(center);
            orbitControls.target.copy(center);
            orbitControls.update();
            
            log('Vista centrada en modelo');
            statusEl.textContent = 'Vista centrada en modelo';
        }
    });
    
    // Teclas de acceso rápido
    document.addEventListener('keydown', (event) => {
        if (isARMode) return; // No funcionar en modo AR
        
        switch(event.key) {
            case '1':
                changeRoutine(1);
                break;
            case '2':
                changeRoutine(2);
                break;
            case '3':
                changeRoutine(3);
                break;
            case 'r':
            case 'R':
                // Reset cámara
                camera.position.set(0, 1.6, 3);
                camera.lookAt(0, 0, 0);
                orbitControls.target.set(0, 0, 0);
                orbitControls.update();
                statusEl.textContent = 'Cámara reiniciada (Tecla R)';
                break;
            case 'h':
            case 'H':
                // Mostrar/ocultar ayuda
                toggleHelpPanel();
                break;
        }
    });
    
    log('Características PC configuradas: doble clic, teclas 1-3, R (reset), H (ayuda)');
}

// Cambiar rutina por función
function changeRoutine(mode) {
    if (mode !== currentMode) {
        currentMode = mode;
        log(`Rutina ${currentMode} seleccionada por teclado`);
        statusEl.textContent = `Rutina ${currentMode} seleccionada (Tecla ${mode})`;
        
        const isDesktop = !/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const webPosition = new THREE.Vector3(0, 0, 0);
        const webRotation = new THREE.Quaternion();
        const webScale = new THREE.Vector3(
            isDesktop ? 0.7 : 0.5,
            isDesktop ? 0.7 : 0.5,
            isDesktop ? 0.7 : 0.5
        );
        loadModelForCurrentMode(webPosition, webRotation, webScale);
    }
}

// Toggle panel de ayuda
function toggleHelpPanel() {
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel) {
        const isVisible = infoPanel.style.display !== 'none';
        infoPanel.style.display = isVisible ? 'none' : 'block';
        statusEl.textContent = `Panel de ayuda ${isVisible ? 'oculto' : 'mostrado'} (Tecla H)`;
    }
}

// Configurar botón de alternancia AR
function setupARToggle() {
    const arToggle = document.getElementById('ar-toggle');
    if (arToggle) {
        arToggle.style.display = 'block';
        arToggle.textContent = 'Entrar a AR';
        log('Botón AR configurado');
    }
}

// Ocultar botón AR si no está disponible
function hideARButton() {
    const arToggle = document.getElementById('ar-toggle');
    if (arToggle) {
        arToggle.style.display = 'none';
    }
}

// Alternar entre modo web y AR
async function toggleARMode() {
    // Verificar si estamos en PC
    const isDesktop = !/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isDesktop) {
        statusEl.textContent = 'AR solo disponible en dispositivos móviles compatibles';
        log('Intento de AR en PC bloqueado');
        return;
    }
    
    if (isARMode) {
        // Salir de AR
        exitARMode();
    } else {
        // Entrar a AR
        await enterARMode();
    }
}

// Entrar al modo AR
async function enterARMode() {
    try {
        log('Intentando entrar al modo AR...');
        
        // Verificar soporte AR nuevamente
        const arSupported = await checkARSupport();
        if (!arSupported) {
            statusEl.textContent = 'AR no disponible en este dispositivo';
            return;
        }
        
        // Inicializar componentes AR
        initializeAR();
        
        // El botón AR se creará automáticamente por ARButton.createButton()
        // Esperamos a que el usuario lo presione
        
    } catch (error) {
        log(`Error entrando a AR: ${error.message}`);
        statusEl.textContent = 'Error activando AR';
    }
}

// Salir del modo AR
function exitARMode() {
    log('Saliendo del modo AR...');
    
    if (renderer.xr.getSession()) {
        renderer.xr.getSession().end();
    }
    
    // Volver a modo web
    switchToWebMode();
}

// Cambiar a modo web
function switchToWebMode() {
    isARMode = false;
    document.body.classList.remove('ar-mode');
    
    // Mostrar controles de cámara
    if (cameraControls) {
        cameraControls.style.display = 'block';
    }
    
    // Habilitar controles de órbita
    orbitControls.enabled = true;
    
    // Ocultar retículo
    reticle.visible = false;
    
    // Actualizar botón
    const arToggle = document.getElementById('ar-toggle');
    if (arToggle) {
        arToggle.textContent = 'Entrar a AR';
        arToggle.style.background = 'rgba(0, 150, 255, 0.8)';
    }
    
    // Mantener modelo actual pero ajustar posición si es necesario
    if (currentModel) {
        currentModel.position.set(0, 0, 0);
        camera.lookAt(currentModel.position);
    }
    
    statusEl.textContent = 'Modo web activo. Usa los controles para ver el modelo.';
    log('Cambiado a modo web');
}

// Cambiar a modo AR
function switchToARMode() {
    isARMode = true;
    document.body.classList.add('ar-mode');
    
    // Ocultar controles de cámara
    if (cameraControls) {
        cameraControls.style.display = 'none';
    }
    
    // Deshabilitar controles de órbita
    orbitControls.enabled = false;
    
    // Actualizar botón
    const arToggle = document.getElementById('ar-toggle');
    if (arToggle) {
        arToggle.textContent = 'Salir de AR';
        arToggle.style.background = 'rgba(255, 100, 0, 0.8)';
    }
    
    log('Cambiado a modo AR');
}

// Función para verificar soporte completo de AR
async function checkARSupport() {
    try {
        // Verificar WebXR API
        if (!navigator.xr) {
            log('WebXR API no disponible');
            return false;
        }

        // Verificar soporte específico para AR inmersivo
        const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
        log(`Sesión immersive-ar soportada: ${arSupported}`);
        
        if (!arSupported) {
            return false;
        }

        // Verificar hit-test support
        try {
            const session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['hit-test']
            });
            await session.end();
            log('Hit-test verificado y soportado');
            return true;
        } catch (error) {
            log(`Hit-test no soportado: ${error.message}`);
            return false;
        }
    } catch (error) {
        log(`Error en verificación AR: ${error.message}`);
        return false;
    }
}

// Inicializar componentes AR
function initializeAR() {
    log('Inicializando componentes AR...');
    
    // Configurar overlay DOM para AR
    const config = window.CONFIG.AR;
    config.domOverlay.root = document.body;
    
    // Crear botón AR con configuración completa
    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: config.requiredFeatures,
        optionalFeatures: config.optionalFeatures,
        domOverlay: config.domOverlay
    });
    
    // Personalizar botón AR
    arButton.style.cssText += `
        position: fixed !important;
        bottom: 20px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 999 !important;
        background: rgba(0, 150, 255, 0.9) !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 12px 20px !important;
        font-size: 16px !important;
        font-weight: bold !important;
        color: white !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
    `;
    
    document.body.appendChild(arButton);
    log('Botón AR creado y configurado');
    
    // Configurar eventos de sesión AR
    renderer.xr.addEventListener('sessionstart', onARSessionStart);
    renderer.xr.addEventListener('sessionend', onARSessionEnd);
    
    // Iniciar precarga después de configurar AR
    preloadModels().catch(error => {
        log(`Error en precarga: ${error.message}`);
    });
}

// Eventos de sesión AR
function onARSessionStart() {
    log('Sesión AR iniciada');
    switchToARMode();
    statusEl.textContent = 'AR activo. Apunta la cámara al suelo para colocar modelos 👇';
    hideLoading();
}

function onARSessionEnd() {
    log('Sesión AR terminada');
    switchToWebMode();
    
    // Mantener el modelo pero reposicionarlo para modo web
    if (currentModel) {
        currentModel.position.set(0, 0, 0);
        currentModel.rotation.set(0, 0, 0);
    }
}

// Mensaje cuando AR no está soportado
function showARNotSupportedMessage() {
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
        z-index: 1002;
        max-width: 80%;
    `;
    messageDiv.innerHTML = `
        <h3>AR No Disponible</h3>
        <p>Tu dispositivo no soporta WebXR AR.</p>
        <p><strong>Requerimientos:</strong></p>
        <ul style="text-align: left; margin: 10px 0;">
            <li>Chrome/Edge 79+ en Android</li>
            <li>Dispositivo compatible con ARCore</li>
            <li>HTTPS (conexión segura)</li>
        </ul>
        <button onclick="this.parentElement.remove()" 
                style="background: white; color: red; border: none; padding: 8px 16px; border-radius: 4px; margin-top: 10px;">
            Cerrar
        </button>
    `;
    document.body.appendChild(messageDiv);
}

init();
animate();

function init() {
    log('Inicializando aplicación WebXR...');
    
    // Información del dispositivo para diagnóstico
    const userAgent = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isDesktop = !isMobile;
    log(`Dispositivo: ${isMobile ? 'Móvil' : 'PC/Escritorio'}`);
    log(`User Agent: ${userAgent.substring(0, 50)}...`);
    
    // Información de red si está disponible
    if (navigator.connection) {
        const conn = navigator.connection;
        log(`Red: ${conn.effectiveType || 'desconocida'}, downlink: ${conn.downlink || 'N/A'}Mbps`);
    }

    const container = document.body;

    // Escena
    scene = new THREE.Scene();
    log('Escena creada');

    // Cámara optimizada según dispositivo
    const fov = isDesktop ? 75 : 60; // FOV más amplio en PC
    
    camera = new THREE.PerspectiveCamera(
        fov,
        window.innerWidth / window.innerHeight,
        0.01,
        20
    );
    
    // Posición inicial de la cámara para modo web
    camera.position.set(0, 1.6, 3);
    camera.lookAt(0, 0, 0);
    
    log(`Cámara creada (FOV: ${fov}, móvil: ${isMobile})`);

    // Renderer optimizado según dispositivo
    const renderConfig = {
        antialias: isDesktop, // Antialiasing completo en PC
        alpha: true,
        powerPreference: isDesktop ? 'high-performance' : 'default',
        logarithmicDepthBuffer: true // Mejor precisión de profundidad
    };
    
    renderer = new THREE.WebGLRenderer(renderConfig);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isDesktop ? 2 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = isMobile; // XR solo en móviles
    container.appendChild(renderer.domElement);
    log(`Renderer creado (pixelRatio: ${renderer.getPixelRatio()}, XR: ${renderer.xr.enabled})`);

    // Controles de órbita optimizados según dispositivo
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = isDesktop ? 0.03 : 0.05; // Más suave en PC
    orbitControls.enableZoom = true;
    orbitControls.enablePan = true;
    orbitControls.maxDistance = isDesktop ? 15 : 10;
    orbitControls.minDistance = 0.3;
    orbitControls.maxPolarAngle = Math.PI / 1.8; // Permitir ver un poco desde abajo
    orbitControls.autoRotate = false; // Opcional: rotación automática
    orbitControls.autoRotateSpeed = 0.5;
    log('Controles de órbita configurados para ' + (isDesktop ? 'PC' : 'móvil'));

    // Iluminación mejorada para modo web y AR
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0.5, 1, 0.25);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 0.4);
    scene.add(hemisphereLight);
    
    log('Iluminación configurada');

    // Retículo
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.15, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Controlador (tap del usuario)
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // Suelo de referencia para modo web
    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x808080, 
        transparent: true, 
        opacity: 0.3 
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    scene.add(floor);
    log('Suelo de referencia agregado');

    // Inicializar modo web primero
    initializeWebMode();
    
    // AR solo en dispositivos móviles
    if (isMobile && navigator.xr) {
        log('Dispositivo móvil detectado, verificando AR...');
        checkARSupport().then((isSupported) => {
            if (isSupported) {
                log('WebXR AR disponible como opción');
                setupARToggle();
            } else {
                log('AR no disponible - solo modo web');
                hideARButton();
            }
        }).catch(error => {
            log(`AR no disponible: ${error.message}`);
            hideARButton();
        });
    } else {
        log('PC detectado - modo AR no disponible');
        hideARButton();
        // Mensaje informativo para PC
        if (isDesktop) {
            const arToggle = document.getElementById('ar-toggle');
            if (arToggle) {
                arToggle.textContent = 'AR (Solo móvil)';
                arToggle.disabled = true;
                arToggle.style.opacity = '0.5';
                arToggle.style.cursor = 'not-allowed';
            }
        }
    }

    // Botones UI
    document.querySelectorAll('#buttons button').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.id === 'debug-toggle') {
                toggleDebug();
                return;
            }
            
            if (btn.id === 'ar-toggle') {
                toggleARMode();
                return;
            }
            
            const mode = parseInt(btn.dataset.mode, 10);
            if (!mode) return;
            
            currentMode = mode;
            log(`Rutina ${currentMode} seleccionada por usuario`);

            statusEl.textContent = `Rutina ${currentMode} seleccionada.`;

            // Cargar modelo en la posición apropiada según el modo
            if (isARMode && currentModel) {
                // En AR, mantener posición actual
                loadModelForCurrentMode(
                    currentModel.position.clone(),
                    currentModel.quaternion.clone(),
                    currentModel.scale.clone()
                );
            } else {
                // En modo web, posición central
                const webPosition = new THREE.Vector3(0, 0, 0);
                const webRotation = new THREE.Quaternion();
                const webScale = new THREE.Vector3(0.5, 0.5, 0.5);
                loadModelForCurrentMode(webPosition, webRotation, webScale);
            }
        });
    });

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Tap en pantalla para colocar modelos AR
function onSelect() {
    // Solo funcionar si estamos en una sesión AR activa
    if (!renderer.xr.isPresenting) {
        log('Intento de colocación fuera de sesión AR ignorado');
        return;
    }
    
    if (reticle.visible) {
        log('Colocando modelo en posición detectada');
        
        const position = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
        
        // Verificar distancia mínima y máxima
        const distance = position.distanceTo(camera.position);
        const config = window.CONFIG.MODEL;
        
        if (distance < config.minDistance) {
            log(`Modelo muy cerca: ${distance.toFixed(2)}m (mín: ${config.minDistance}m)`);
            statusEl.textContent = 'Modelo muy cerca. Aleja un poco la cámara.';
            return;
        }
        
        if (distance > config.maxDistance) {
            log(`Modelo muy lejos: ${distance.toFixed(2)}m (máx: ${config.maxDistance}m)`);
            statusEl.textContent = 'Modelo muy lejos. Acerca un poco la cámara.';
            return;
        }

        const quaternion = new THREE.Quaternion();
        const rotMatrix = new THREE.Matrix4().extractRotation(reticle.matrix);
        quaternion.setFromRotationMatrix(rotMatrix);

        const scale = currentModel
            ? currentModel.scale.clone()
            : new THREE.Vector3(
                config.defaultScale.x,
                config.defaultScale.y,
                config.defaultScale.z
            );

        loadModelForCurrentMode(position, quaternion, scale);

        statusEl.textContent = 'Modelo colocado en AR. Toca para cambiar rutina.';
        log(`Modelo colocado a ${distance.toFixed(2)}m de distancia`);
    } else if (currentModel) {
        log('Cambiando rutina de modelo existente');
        cycleMode();
    } else {
        log('No hay superficie detectada para colocar modelo');
        statusEl.textContent = 'Apunta la cámara a una superficie plana';
    }
}

// Cambia rutina cíclica
function cycleMode() {
    currentMode = (currentMode % 3) + 1;

    statusEl.textContent = `Cambiando a rutina ${currentMode}…`;

    if (currentModel) {
        loadModelForCurrentMode(
            currentModel.position.clone(),
            currentModel.quaternion.clone(),
            currentModel.scale.clone()
        );
    }
}

// Carga el GLB indicado (usando precarga cuando esté disponible)
async function loadModelForCurrentMode(position, quaternion, scale) {
    const url = MODELS[currentMode];
    
    log(`Cargando modelo para rutina ${currentMode}`);
    
    // Evitar múltiples cargas simultáneas del mismo modelo
    if (loadingModels[currentMode]) {
        log(`Modelo ${currentMode} ya está cargando, esperando...`);
        return;
    }

    if (currentModel) {
        log('Removiendo modelo anterior');
        scene.remove(currentModel);
        disposeModel(currentModel);
        currentModel = null;
    }

    loadingModels[currentMode] = true;
    statusEl.textContent = `Cargando rutina ${currentMode}...`;
    statusEl.className = 'loading';

    try {
        let gltf;
        
        // Usar modelo precargado si está disponible
        if (preloadedModels[currentMode]) {
            log(`Usando modelo precargado para rutina ${currentMode}`);
            gltf = preloadedModels[currentMode];
            
            // Clonar la escena para evitar problemas con múltiples instancias
            currentModel = gltf.scene.clone();
        } else {
            log(`Modelo no precargado, cargando desde: ${url}`);
            
            // Cargar con timeout para conexiones lentas
            gltf = await loadModelWithTimeout(url, 30000); // 30 segundos timeout
            currentModel = gltf.scene;
        }

        currentModel.position.copy(position);
        currentModel.quaternion.copy(quaternion);
        currentModel.scale.copy(scale);

        scene.add(currentModel);
        log(`Modelo ${currentMode} agregado a la escena`);

        // Animaciones
        if (gltf.animations && gltf.animations.length > 0) {
            log(`Configurando ${gltf.animations.length} animaciones`);
            const mixer = new THREE.AnimationMixer(currentModel);
            const clip = gltf.animations[0];
            const action = mixer.clipAction(clip);
            action.play();
            currentModel.userData.mixer = mixer;
        }

        statusEl.textContent = `Rutina ${currentMode} activa.`;
        statusEl.className = '';
        log(`Rutina ${currentMode} cargada exitosamente`);
        
    } catch (error) {
        log(`ERROR cargando modelo ${currentMode}: ${error.message}`);
        statusEl.textContent = `Error cargando rutina ${currentMode}: ${error.message}`;
        statusEl.className = 'error';
        
        // Mostrar información de red si es posible
        if (navigator.connection) {
            const connection = navigator.connection;
            log(`Red: ${connection.effectiveType}, downlink: ${connection.downlink}Mbps`);
        }
    } finally {
        loadingModels[currentMode] = false;
    }
}

// Cargar modelo con timeout y fallback para GitHub Pages
function loadModelWithTimeout(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error('Timeout: La carga del modelo tardó demasiado'));
        }, timeout);

        // Intentar carga con Draco primero
        loader.load(
            url,
            (gltf) => {
                clearTimeout(timeoutId);
                log(`Modelo cargado exitosamente con Draco: ${url}`);
                resolve(gltf);
            },
            (progress) => {
                if (progress.total > 0) {
                    const percent = Math.round((progress.loaded / progress.total) * 100);
                    log(`Cargando modelo: ${percent}%`);
                    statusEl.textContent = `Cargando rutina ${currentMode}: ${percent}%`;
                }
            },
            (error) => {
                log(`Error con Draco, intentando fallback: ${error.message}`);
                
                // Fallback sin Draco para GitHub Pages
                fallbackLoader.load(
                    url,
                    (gltf) => {
                        clearTimeout(timeoutId);
                        log(`Modelo cargado con fallback: ${url}`);
                        resolve(gltf);
                    },
                    (progress) => {
                        if (progress.total > 0) {
                            const percent = Math.round((progress.loaded / progress.total) * 100);
                            log(`Cargando (fallback): ${percent}%`);
                            statusEl.textContent = `Cargando rutina ${currentMode} (fallback): ${percent}%`;
                        }
                    },
                    (fallbackError) => {
                        clearTimeout(timeoutId);
                        reject(new Error(`Error en ambos loaders: Draco(${error.message}) Fallback(${fallbackError.message})`));
                    }
                );
            }
        );
    });
}

// Limpieza de recursos
function disposeModel(model) {
    model.traverse((child) => {
        if (child.isMesh) {
            child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            }
        }
    });
}

// Loop principal de animación y renderizado AR
function animate() {
    renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
    const delta = clock.getDelta();

    // Actualizar controles de órbita en modo web
    if (!isARMode && orbitControls) {
        orbitControls.update();
    }

    // Actualizar animaciones de modelos
    if (currentModel && currentModel.userData.mixer) {
        currentModel.userData.mixer.update(delta);
    }

    // PROCESAMIENTO AR: Hit-testing solo en sesiones AR activas
    if (frame && renderer.xr.isPresenting && isARMode) {
        handleARFrame(frame);
    }

    renderer.render(scene, camera);
}

// Manejo específico de frames AR
function handleARFrame(frame) {
    try {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        // Inicializar hit-test source si no se ha hecho
        if (!hitTestSourceRequested && session) {
            initializeHitTesting(session);
        }

        // Procesar hit-test results
        if (hitTestSource) {
            processHitTestResults(frame, referenceSpace);
        }
    } catch (error) {
        log(`Error en frame AR: ${error.message}`);
    }
}

// Inicializar sistema de hit-testing
async function initializeHitTesting(session) {
    try {
        log('Inicializando hit-testing...');
        
        const refSpace = await session.requestReferenceSpace('viewer');
        hitTestSource = await session.requestHitTestSource({ space: refSpace });
        
        log('Hit-testing inicializado correctamente');
        
        // Limpiar cuando termine la sesión
        session.addEventListener('end', () => {
            log('Limpiando hit-test al terminar sesión AR');
            hitTestSourceRequested = false;
            hitTestSource = null;
            reticle.visible = false;
        });

        hitTestSourceRequested = true;
        
    } catch (error) {
        log(`Error inicializando hit-testing: ${error.message}`);
        hitTestSourceRequested = false;
    }
}

// Procesar resultados de hit-testing
function processHitTestResults(frame, referenceSpace) {
    try {
        const hitTestResults = frame.getHitTestResults(hitTestSource);

        if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const pose = hit.getPose(referenceSpace);
            
            if (pose) {
                // Mostrar retículo en la posición detectada
                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
                
                // Opcional: rotar retículo para indicar disponibilidad
                const time = performance.now() / 1000;
                reticle.rotation.y = Math.sin(time * 2) * 0.1;
            } else {
                reticle.visible = false;
            }
        } else {
            // No hay superficies detectadas
            reticle.visible = false;
        }
    } catch (error) {
        log(`Error procesando hit-test: ${error.message}`);
        reticle.visible = false;
    }
}
