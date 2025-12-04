import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

let container;
let camera, scene, renderer;
let controller;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;
let currentModel = null;
let mixer = null;
let animations = [];
let loader;

// Models configuration
const models = [
    './model/modelo-final.glb',
    './model (2)/movimiento2.glb',
    './model (3)/movimiento3.glb'
];

init();
animate();

function showToast(message) {
    const toast = document.getElementById('ar-toast');
    if (toast) {
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }
}

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 1, 0);
    scene.add(directionalLight);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // AR Button with Hit Test support
    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('overlay') }
    });
    document.body.appendChild(arButton);

    // Controller
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // Reticle (The cursor on the floor)
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Loader setup with Draco
    loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(dracoLoader);

    // Load initial model (hidden until placed)
    loadModel(models[0], null, null);

    // UI Buttons
    document.getElementById('btn-model-1').addEventListener('click', () => loadModel(models[0], currentModel ? currentModel.position : null));
    document.getElementById('btn-model-2').addEventListener('click', () => loadModel(models[1], currentModel ? currentModel.position : null));
    document.getElementById('btn-model-3').addEventListener('click', () => loadModel(models[2], currentModel ? currentModel.position : null));

    window.addEventListener('resize', onWindowResize);
}

function loadModel(url, position = null, quaternion = null) {
    // Store current transform if we are replacing an existing model and no specific pos was given
    let targetPos = position;
    let targetQuat = quaternion;

    if (currentModel) {
        // If we didn't pass a specific new position, but we have a model, keep its spot?
        // Actually, the caller should handle this.
        scene.remove(currentModel);
        currentModel = null;
        mixer = null;
        animations = [];
    }

    showToast("Cargando...");

    loader.load(
        url,
        (gltf) => {
            currentModel = gltf.scene;
            animations = gltf.animations;

            // Scale
            currentModel.scale.set(0.15, 0.15, 0.15);

            if (targetPos) {
                // Use provided position (e.g. from previous model or specific logic)
                currentModel.position.copy(targetPos);
                if (targetQuat) currentModel.quaternion.copy(targetQuat);
            } else if (reticle.visible) {
                // Place at reticle if no specific pos
                currentModel.position.setFromMatrixPosition(reticle.matrix);
            } else {
                // Default in front of camera (0, 0, -1 relative to camera usually, but here world space)
                // In WebXR 'local-floor', 0,0,0 is start feet. 
                currentModel.position.set(0, 0, -1);
                currentModel.visible = false; // Hide if not placed yet and no reticle
            }

            // Ensure it's visible if we have a position
            if (targetPos || reticle.visible) {
                currentModel.visible = true;
            }

            scene.add(currentModel);

            if (animations && animations.length > 0) {
                mixer = new THREE.AnimationMixer(currentModel);
                const action = mixer.clipAction(animations[0]);
                action.play();
            }

            showToast("Listo.");
        },
        undefined,
        (error) => {
            console.error(error);
            showToast("Error al cargar.");
        }
    );
}

function onSelect() {
    if (!currentModel && !reticle.visible) return;

    // 1. Check if we hit the model (Change Pose)
    if (currentModel && currentModel.visible) {
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        const raycaster = new THREE.Raycaster();
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

        const intersects = raycaster.intersectObject(currentModel, true);

        if (intersects.length > 0) {
            showToast("¡Cambio de pose!");
            const randomIndex = Math.floor(Math.random() * models.length);

            // RELOAD AT SAME POSITION
            loadModel(models[randomIndex], currentModel.position, currentModel.quaternion);
            return;
        }
    }

    // 2. If not hit model, Move Model to Reticle
    if (reticle.visible) {
        if (currentModel) {
            currentModel.visible = true;
            currentModel.position.setFromMatrixPosition(reticle.matrix);
            showToast("Modelo movido");
        } else {
            // First load if not exists (shouldn't happen with current logic but safe)
            loadModel(models[0]);
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(render);
}

const clock = new THREE.Clock();

function render(timestamp, frame) {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });

            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });

            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }

    renderer.render(scene, camera);
}
