/* ============================================================
   PANEL DE CONTROL ARTE  —  APP.JS OPTIMIZADO (PARTE 1/6)
   ------------------------------------------------------------
   Esta versión incluye:
   - Eliminación total de funciones duplicadas
   - Reorganización profesional por módulos
   - Inicialización robusta de Firebase
   - Variables globales limpias
   - Compatible con tu index.html actual
   - Preparado para sincronización avanzada
   ============================================================ */


/* ============================================================
   1. CONFIGURACIÓN GLOBAL Y CONSTANTES
   ============================================================ */

console.log("%cPanel de Control Arte — Modo Optimizado (v6)", 
    "color:#16a34a;font-weight:bold;font-size:14px");


// ---- Versión del esquema de base de datos ----
const DB_SCHEMA_VERSION = 1;


// ---- Tamaño de tabla ----
const PAGE_SIZE = 30;


// ---- Estado global de la app ----
let usuarioActual = null;
let currentUserRole = null;
let isAuthInitialized = false;
let isExcelLoaded = false;
let needsRecalculation = true;


// ---- Arrays maestros ----
let allOrders = [];         // Todas las órdenes del Excel + Firebase
let filteredOrders = [];    // Ordenes filtradas para tabla paginada


// ---- Variables de filtros ----
let currentSearchTerm = "";
let currentStatusFilter = "Todos";
let currentDesignerFilter = "Todos";
let currentDepartmentFilter = "P_Art";
let currentSortField = "fechaDespacho";
let currentSortDirection = "asc";


// ---- Firebase snapshots almacenados en memoria ----
let firebaseAssignmentsMap = new Map();
let firebaseHistoryMap = new Map();
let firebaseChildOrdersMap = new Map();
let firebaseDesignersMap = new Map();


// ---- Control de autocompletado ----
let autoCompleteBatchWrites = [];
let autoCompletedOrderIds = new Set();


// ---- Instancias de gráficos (creadas más adelante) ----
let designerDoughnutChart = null;
let designerBarChart = null;
let designerActivityChart = null;
let currentDesignerTrendChart = null;
let ordersByStatusChart = null;
let ordersByClientChart = null;
let ordersByStyleChart = null;
let ordersByWeekChart = null;


// ---- Control de modales ----
let confirmCallback = null;
let isStrictConfirm = false;


// ---- Manejo de listeners Firebase ----
let unsubscribeAssignments = null;
let unsubscribeHistory = null;
let unsubscribeChildOrders = null;
let unsubscribeDesigners = null;




/* ============================================================
   2. CONFIGURACIÓN DE FIREBASE
   ============================================================ */

// ---- Configuración oficial (igual a tu archivo original) ----
const firebaseConfig = {
    apiKey: "AIzaSyB9d-XXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "fitwell-artes.firebaseapp.com",
    projectId: "fitwell-artes",
    storageBucket: "fitwell-artes.appspot.com",
    messagingSenderId: "XXXXXXXXXXXX",
    appId: "1:XXXXXXXXXXXX:web:YYYYYYYYYYYYYYYYYYYY"
};

// ---- Inicialización ----
firebase.initializeApp(firebaseConfig);

const db_firestore = firebase.firestore();
const db_auth = firebase.auth();


// ---- Minimizar logs ----
if (firebase.firestore && firebase.firestore.setLogLevel) {
    firebase.firestore.setLogLevel("error");
}



/* ============================================================
   3. UTILIDADES GENERALES
   ============================================================ */

// Manejo seguro de addEventListener
function safeAddEventListener(idOrElement, evt, callback, opts = false) {
    try {
        const el = 
            typeof idOrElement === "string"
            ? document.getElementById(idOrElement)
            : idOrElement;
        if (el) el.addEventListener(evt, callback, opts);
    } catch (err) {
        console.warn("safeAddEventListener error:", err);
    }
}

// Mostrar loading global
function showLoading(msg = "Cargando...") {
    const overlay = document.getElementById("loadingOverlay");
    const text = document.getElementById("loadingText");
    if (!overlay || !text) return;
    text.textContent = msg;
    overlay.classList.remove("hidden");
}

// Ocultar loading global
function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (!overlay) return;
    overlay.classList.add("hidden");
}

// Alertas personalizadas (equivalente original)
function showCustomAlert(message, type = "info", duration = 3500) {
    const cont = document.getElementById("customAlertContainer");
    if (!cont) return alert(message);

    const div = document.createElement("div");
    div.className = `custom-alert custom-alert-${type}`;

    div.innerHTML = `
        <div class="flex items-center gap-2">
            <span>${
                type === "success" ? "✅" :
                type === "error"   ? "❌" :
                type === "warning" ? "⚠️" : "ℹ️"
            }</span>
            <span>${message}</span>
        </div>
    `;

    cont.appendChild(div);

    setTimeout(() => {
        div.classList.add("fade-out");
        setTimeout(() => div.remove(), 300);
    }, duration);
}

// Registro en Firestore (logs)
function logToFirestore(action, payload) {
    try {
        db_firestore.collection("logs").add({
            action,
            payload: JSON.stringify(payload || null),
            user: usuarioActual ? usuarioActual.email : null,
            timestamp: new Date().toISOString(),
            schemaVersion: DB_SCHEMA_VERSION
        });
    } catch (err) {
        console.warn("Error registrando log:", err);
    }
}




/* ============================================================
   4. AUTENTICACIÓN DE USUARIO (VERSION ROBUSTA)
   ============================================================ */

async function initAuth() {
    if (isAuthInitialized) return;
    isAuthInitialized = true;

    db_auth.onAuthStateChanged(async (user) => {
        if (user) {
            usuarioActual = user;

            // Mostrar app
            document.getElementById("loginSection").classList.add("hidden");
            document.getElementById("mainApp").classList.remove("hidden");

            // Rol
            await fetchUserRole(user);

            // Listeners Firebase
            await initRealtimeListeners();

            // UI según rol
            updateUIForRole();

        } else {
            usuarioActual = null;
            document.getElementById("mainApp").classList.add("hidden");
            document.getElementById("loginSection").classList.remove("hidden");
        }
    });

    // Login form
    safeAddEventListener("loginForm", "submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("emailInput").value.trim();
        const pass = document.getElementById("passwordInput").value.trim();
        if (!email || !pass) return;

        showLoading("Conectando...");
        try {
            await db_auth.signInWithEmailAndPassword(email, pass);
            showCustomAlert("Sesión iniciada.", "success");
        } catch (err) {
            showCustomAlert("Error al iniciar sesión: " + err.message, "error");
        } finally {
            hideLoading();
        }
    });

    // Logout
    safeAddEventListener("logoutBtn", "click", async () => {
        try {
            await db_auth.signOut();
            showCustomAlert("Sesión cerrada.", "success");
        } catch (err) {
            showCustomAlert("Error al cerrar sesión.", "error");
        }
    });
}


// Obtener rol de usuario desde Firestore
async function fetchUserRole(user) {
    try {
        const ref = db_firestore.collection("users").doc(user.uid);
        const snap = await ref.get();

        currentUserRole = snap.exists
            ? (snap.data().role || "viewer")
            : "viewer";

    } catch (err) {
        console.error("Error obteniendo rol:", err);
        currentUserRole = "viewer";
    }
}


// Mostrar / ocultar elementos según rol
function updateUIForRole() {
    const adminOnly = document.querySelectorAll(".role-admin");
    adminOnly.forEach(el => {
        el.style.display =
            (currentUserRole === "admin" || currentUserRole === "coordinator")
            ? ""
            : "none";
    });
}

/* ============================================================
   5. LISTENERS EN TIEMPO REAL (ROBUSTOS Y OPTIMIZADOS)
   ============================================================ */

/*
   Esta es la versión robusta de los listeners:
   - Limpia listeners previos para evitar duplicados
   - Maneja errores individuales sin detener toda la app
   - Actualiza el estado visual de conexión
   - Sincroniza cada colección con sus mapas en memoria
   - Dispara mergeYActualizar una sola vez por ciclo
*/

async function initRealtimeListeners() {
    if (!usuarioActual) return;

    showLoading("Conectando con Firebase...");

    // Limpieza previa (evita listeners duplicados si se re-loguea)
    if (unsubscribeAssignments) unsubscribeAssignments();
    if (unsubscribeHistory) unsubscribeHistory();
    if (unsubscribeChildOrders) unsubscribeChildOrders();
    if (unsubscribeDesigners) unsubscribeDesigners();

    /* ------------------------------------------------------------
       ASIGNACIONES
       ------------------------------------------------------------ */
    unsubscribeAssignments = db_firestore
        .collection("assignments")
        .onSnapshot(
            (snapshot) => {
                try {
                    firebaseAssignmentsMap.clear();
                    snapshot.forEach((doc) => {
                        const d = doc.data() || {};
                        firebaseAssignmentsMap.set(doc.id, {
                            designer: d.designer || "",
                            customStatus: d.customStatus || "",
                            receivedDate: d.receivedDate || "",
                            notes: d.notes || "",
                            completedDate: d.completedDate || null,
                            childPieces:
                                typeof d.childPieces === "number"
                                    ? d.childPieces
                                    : null
                        });
                    });

                    if (isExcelLoaded) mergeYActualizar();
                } catch (err) {
                    console.error("Error procesando assignments:", err);
                }
            },
            (err) => console.error("Snapshot assignments error:", err)
        );

    /* ------------------------------------------------------------
       HISTORIAL
       ------------------------------------------------------------ */
    unsubscribeHistory = db_firestore
        .collection("history")
        .onSnapshot(
            (snapshot) => {
                try {
                    firebaseHistoryMap.clear();
                    snapshot.forEach((doc) => {
                        const data = doc.data();
                        if (!firebaseHistoryMap.has(data.orderId)) {
                            firebaseHistoryMap.set(data.orderId, []);
                        }
                        firebaseHistoryMap.get(data.orderId).push(data);
                    });

                    needsRecalculation = true;
                    if (isExcelLoaded) mergeYActualizar();
                } catch (err) {
                    console.error("Error procesando history:", err);
                }
            },
            (err) => console.error("Snapshot history error:", err)
        );

    /* ------------------------------------------------------------
       ÓRDENES HIJAS
       ------------------------------------------------------------ */
    unsubscribeChildOrders = db_firestore
        .collection("childOrders")
        .onSnapshot(
            (snapshot) => {
                try {
                    firebaseChildOrdersMap.clear();
                    snapshot.forEach((doc) => {
                        const data = doc.data();
                        if (!firebaseChildOrdersMap.has(data.parentOrderId)) {
                            firebaseChildOrdersMap.set(data.parentOrderId, []);
                        }
                        firebaseChildOrdersMap.get(data.parentOrderId).push(data);
                    });

                    needsRecalculation = true;
                    if (isExcelLoaded) mergeYActualizar();
                } catch (err) {
                    console.error("Error procesando childOrders:", err);
                }
            },
            (err) => console.error("Snapshot childOrders error:", err)
        );

    /* ------------------------------------------------------------
       DISEÑADORES
       ------------------------------------------------------------ */
    unsubscribeDesigners = db_firestore
        .collection("designers")
        .orderBy("name")
        .onSnapshot(
            (snapshot) => {
                try {
                    firebaseDesignersMap.clear();
                    snapshot.forEach((doc) => {
                        firebaseDesignersMap.set(doc.id, doc.data());
                    });

                    populateDesignersDropdown();
                } catch (err) {
                    console.error("Error procesando designers:", err);
                }
            },
            (err) => console.error("Snapshot designers error:", err)
        );

    // Conexión establecida
    updateFirebaseConnectionStatus(true);

    hideLoading();
    showCustomAlert("Conectado a Firebase.", "success");
}


/* ============================================================
   6. INDICADORES DE CONEXIÓN
   ============================================================ */

function updateFirebaseConnectionStatus(isConnected) {
    const dbStatus = document.getElementById("dbStatus");
    if (!dbStatus) return;

    dbStatus.innerHTML = isConnected
        ? '<i class="fa-solid fa-circle-check text-green-500 mr-1"></i> Conectado'
        : '<i class="fa-solid fa-circle-xmark text-red-500 mr-1"></i> Desconectado';

    dbStatus.className =
        "ml-3 text-xs inline-flex items-center " +
        (isConnected ? "text-green-700" : "text-red-700");
}



/* ============================================================
   7. CONFIRMACIÓN (MODAL) — VERSIÓN ROBUSTA
   ============================================================ */

function showConfirmModal(message, onConfirmCallback, strict = false) {
    confirmCallback = onConfirmCallback;
    isStrictConfirm = strict;

    const modal = document.getElementById("confirmModal");
    const msg = document.getElementById("confirmModalMessage");
    const strictBox = document.getElementById("confirmStrictContainer");
    const input = document.getElementById("confirmStrictInput");
    const confirmBtn = document.getElementById("confirmModalConfirm");

    msg.textContent = message;

    // Modo estricto (escribir CONFIRMAR)
    if (strict) {
        strictBox.classList.remove("hidden");
        input.value = "";
        confirmBtn.disabled = true;
        confirmBtn.classList.add("opacity-50", "cursor-not-allowed");
    } else {
        strictBox.classList.add("hidden");
        confirmBtn.disabled = false;
        confirmBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }

    // Clonar botón para evitar listeners duplicados
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener(
        "click",
        () => {
            if (isStrictConfirm) {
                const value = input.value.trim().toUpperCase();
                if (value !== "CONFIRMAR") {
                    showCustomAlert(
                        'Debes escribir "CONFIRMAR" para continuar.',
                        "error"
                    );
                    return;
                }
            }

            if (typeof confirmCallback === "function") confirmCallback();
            closeConfirmModal();
        },
        { once: true }
    );

    modal.classList.add("active");
    document.body.classList.add("modal-open");
}

function closeConfirmModal() {
    const modal = document.getElementById("confirmModal");
    modal.classList.remove("active");

    confirmCallback = null;
    isStrictConfirm = false;
    const input = document.getElementById("confirmStrictInput");
    if (input) input.value = "";

    checkAndCloseModalStack();
}

function checkStrictInput() {
    if (!isStrictConfirm) return;

    const input = document.getElementById("confirmStrictInput");
    const btn = document.getElementById("confirmModalConfirm");

    if (input.value.trim().toUpperCase() === "CONFIRMAR") {
        btn.disabled = false;
        btn.classList.remove("opacity-50", "cursor-not-allowed");
    } else {
        btn.disabled = true;
        btn.classList.add("opacity-50", "cursor-not-allowed");
    }
}

function checkAndCloseModalStack() {
    const active = document.querySelector(".modal-overlay.active");
    if (!active) document.body.classList.remove("modal-open");
}

/* ============================================================
   8. PROCESAMIENTO DEL EXCEL (ROBUSTO Y OPTIMIZADO)
   ============================================================ */

/*
   Flujo completo:
   1. Usuario selecciona archivo (input type="file")
   2. Se valida que sea .xlsx o .xls
   3. Se convierte a JSON usando XLSX.read
   4. Se normalizan campos (fechas, strings, números)
   5. Se crea el array maestro allOrders[]
   6. Se marca isExcelLoaded = true
   7. Se dispara mergeYActualizar()
*/


// Listener para leer Excel
safeAddEventListener("excelFileInput", "change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const name = file.name.toLowerCase();

    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
        showCustomAlert("El archivo debe ser un Excel (.xlsx)", "error");
        return;
    }

    showLoading("Procesando archivo Excel...");
    await loadExcelFile(file);
    hideLoading();
});



/* ------------------------------------------------------------
   Función principal: carga y convierte el Excel a JSON
   ------------------------------------------------------------ */
async function loadExcelFile(file) {
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });

        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        if (!sheet) {
            showCustomAlert("No se pudo leer la hoja del Excel.", "error");
            return;
        }

        const rawJSON = XLSX.utils.sheet_to_json(sheet, {
            defval: "",
            raw: false
        });

        if (rawJSON.length === 0) {
            showCustomAlert("El Excel está vacío.", "warning");
            return;
        }

        console.log("Excel cargado. Filas:", rawJSON.length);

        processExcelJSON(rawJSON);

    } catch (err) {
        console.error("Error procesando Excel:", err);
        showCustomAlert("Error al leer el archivo Excel.", "error");
    }
}



/* ============================================================
   9. PROCESAR JSON DEL EXCEL — LIMPIEZA Y NORMALIZACIÓN
   ============================================================ */

function processExcelJSON(rows) {
    allOrders = [];

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];

        // Evitar filas sin ID o sin PO
        if (!r.ID && !r.Id && !r.PO) continue;

        const orderId =
            String(r.ID || r.Id || r.IdOrden || "").trim().toUpperCase();

        if (!orderId) continue;

        // Normalización de fechas — evitar problema UTC
        const fechaExcel = fixExcelDate(r["Ship Date"] || r["Fecha Despacho"]);

        allOrders.push({
            id: orderId,
            po: cleanValue(r.PO || r.Po || r.po),
            cliente: cleanValue(r.Client || r.Cliente),
            equipo: cleanValue(r.Team || r.Equipo),
            estilo: cleanValue(r.Style || r.Estilo),
            cantidad: parseInt(r.Qty || r.Cantidad || 0),

            // Fechas limpias y sin desfase horario
            fechaDespacho: fechaExcel,

            descripcion: cleanValue(r.Description || r.Descripcion),
            notas: cleanValue(r.Notes || r.Notas),
            departamento: cleanValue(r.Department || "P_Art"),

            // Los siguientes datos serán reemplazados con Firebase
            designer: "",
            customStatus: "",
            receivedDate: "",
            completedDate: "",
            childPieces: null,
            firebaseHistory: [],
            firebaseChildren: []
        });
    }

    isExcelLoaded = true;

    showCustomAlert(
        `Archivo Excel cargado correctamente. ${allOrders.length} órdenes procesadas.`,
        "success"
    );

    // Ahora que se cargó el Excel, sincronizamos con Firebase
    mergeYActualizar();
}



/* ============================================================
   10. UTILIDADES DE LIMPIEZA PARA EL EXCEL
   ============================================================ */

// Limpieza de strings
function cleanValue(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
}


// Corrección automática de fechas Excel → Local
function fixExcelDate(dateValue) {
    if (!dateValue) return "";

    try {
        // Si es un número Excel (ej. 45210)
        if (!isNaN(dateValue)) {
            const excelEpoch = new Date(1899, 11, 30);
            const result = new Date(excelEpoch.getTime() + dateValue * 86400000);

            // Evita desfase UTC usando offset local
            const local = new Date(
                result.getTime() + result.getTimezoneOffset() * 60000
            );

            return local.toISOString().slice(0, 10);
        }

        // Si es un string tipo "2025-02-10"
        const parsed = new Date(dateValue);
        if (!isNaN(parsed)) {
            const local = new Date(
                parsed.getTime() - parsed.getTimezoneOffset() * 60000
            );
            return local.toISOString().slice(0, 10);
        }

    } catch (err) {
        console.warn("Error corrigiendo fecha Excel:", err);
    }

    return "";
}



/* ============================================================
   11. REMOVER DUPLICADOS
   ============================================================ */

function removeDuplicateOrders() {
    const map = new Map();
    for (const order of allOrders) {
        map.set(order.id, order);
    }
    allOrders = [...map.values()];
}
/* ============================================================
   12. MERGE PRINCIPAL — SINCRONIZACIÓN EXCEL ↔ FIREBASE
   ============================================================ */

/*
   OBJETIVO:
   - Tomar los datos del Excel (allOrders)
   - Fusionarlos con la información en Firebase:
       • Asignaciones
       • Historial
       • Órdenes hijas
   - Corregir autocompletados incorrectos
   - Actualizar UI solo una vez por ciclo
   - Mantener rendimiento estable
*/

let mergeInProgress = false;
let lastMergeTimestamp = 0;

async function mergeYActualizar() {
    if (!isExcelLoaded) return;

    if (mergeInProgress) {
        console.warn("mergeYActualizar ignorado (ya en progreso)");
        return;
    }

    mergeInProgress = true;
    lastMergeTimestamp = Date.now();

    try {
        removeDuplicateOrders();
        applyFirebaseAssignments();
        applyFirebaseHistory();
        applyChildOrders();
        applyAutoCompletionProtection();

        if (needsRecalculation) {
            recalculateChildPieces();
            needsRecalculation = false;
        }

        rebuildFilteredOrders();
        updateTable();
        updateDashboardMetrics();
        updateCharts();

    } catch (err) {
        console.error("Error en mergeYActualizar:", err);
    } finally {
        mergeInProgress = false;
    }
}



/* ============================================================
   13. APLICAR ASIGNACIONES DE FIREBASE
   ============================================================ */

function applyFirebaseAssignments() {
    for (const order of allOrders) {
        const fb = firebaseAssignmentsMap.get(order.id);
        if (!fb) continue;

        order.designer = fb.designer || "";
        order.customStatus = fb.customStatus || "";
        order.receivedDate = fb.receivedDate || "";
        order.completedDate = fb.completedDate || "";
        order.childPieces = fb.childPieces ?? null;
    }
}



/* ============================================================
   14. APLICAR HISTORIAL DESDE FIREBASE
   ============================================================ */

function applyFirebaseHistory() {
    for (const order of allOrders) {
        const history = firebaseHistoryMap.get(order.id);
        order.firebaseHistory = history ? [...history] : [];
    }
}



/* ============================================================
   15. APLICAR ÓRDENES HIJAS DESDE FIREBASE
   ============================================================ */

function applyChildOrders() {
    for (const order of allOrders) {
        const children = firebaseChildOrdersMap.get(order.id);
        order.firebaseChildren = children ? [...children] : [];
    }
}



/* ============================================================
   16. AUTOCOMPLETADO INTELIGENTE (Corrección del error original)
   ============================================================ */

/*
   Problema original:
   - Cada vez que se recargaba la página, el sistema autocompletaba
     órdenes que ya se habían completado anteriormente → duplicación.

   Solución:
   - Verificación estricta:
        • Solo autocompletar si:
            - customStatus vacío
            - diseñador asignado
            - no tiene completedDate
            - no existe historial previo de completada
*/

function applyAutoCompletionProtection() {
    for (const order of allOrders) {
        const hasCompletedHistory = order.firebaseHistory?.some(
            (h) => h.status === "Completada"
        );

        const shouldAutoComplete =
            order.customStatus === "" &&
            order.designer &&
            !order.completedDate &&
            !hasCompletedHistory;

        if (shouldAutoComplete) {
            order.customStatus = "Completada";
            order.completedDate = new Date().toISOString().slice(0, 10);

            autoCompletedOrderIds.add(order.id);

            console.log("Autocompletada protegida:", order.id);
        }
    }
}



/* ============================================================
   17. RECÁLCULO INTELIGENTE DE PIEZAS HIJAS
   ============================================================ */

/*
   Versión optimizada:
   - Ya no recalcula TODAS las órdenes
   - Solo las que tienen childOrders relacionados
*/

function recalculateChildPieces() {
    for (const order of allOrders) {
        const children = order.firebaseChildren;
        if (!children || children.length === 0) continue;

        let total = 0;

        for (const child of children) {
            const qty = parseInt(child.quantity || child.qty || 0);
            if (!isNaN(qty)) total += qty;
        }

        order.childPieces = total;
    }
}



/* ============================================================
   18. RECONSTRUIR ORDENES FILTRADAS
   ============================================================ */

function rebuildFilteredOrders() {
    filteredOrders = allOrders.filter((o) => {

        // Filtro por búsqueda
        if (
            currentSearchTerm &&
            !(
                o.id.toLowerCase().includes(currentSearchTerm) ||
                o.po.toLowerCase().includes(currentSearchTerm) ||
                o.cliente.toLowerCase().includes(currentSearchTerm) ||
                o.equipo.toLowerCase().includes(currentSearchTerm)
            )
        ) {
            return false;
        }

        // Filtro por diseñador
        if (currentDesignerFilter !== "Todos") {
            if ((o.designer || "") !== currentDesignerFilter) return false;
        }

        // Filtro por estado
        if (currentStatusFilter !== "Todos") {
            if ((o.customStatus || "") !== currentStatusFilter) return false;
        }

        // Filtro por departamento corregido
        if (currentDepartmentFilter !== "Todos") {
            if ((o.departamento || "P_Art") !== currentDepartmentFilter)
                return false;
        }

        return true;
    });

    // Ordenamiento
    sortFilteredOrders();
}



/* ============================================================
   19. ORDENAMIENTO
   ============================================================ */

function sortFilteredOrders() {
    filteredOrders.sort((a, b) => {
        let valA = a[currentSortField];
        let valB = b[currentSortField];

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return currentSortDirection === "asc" ? -1 : 1;
        if (valA > valB) return currentSortDirection === "asc" ? 1 : -1;
        return 0;
    });
}
/* ============================================================
   20. TABLA PRINCIPAL — RENDERIZADO OPTIMIZADO
   ============================================================ */

let currentPage = 1;

function updateTable() {
    const tbody = document.getElementById("ordersTableBody");
    const pageIndicator = document.getElementById("pageIndicator");

    if (!tbody) return;

    tbody.innerHTML = "";

    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    const pageOrders = filteredOrders.slice(start, end);

    for (const order of pageOrders) {
        const tr = document.createElement("tr");

        tr.className =
            "text-[12px] border-b border-slate-200 hover:bg-slate-100 transition";

        tr.innerHTML = `
            <td class="px-2 py-1 font-semibold">${order.id}</td>
            <td class="px-2 py-1">${order.po}</td>
            <td class="px-2 py-1">${order.cliente}</td>
            <td class="px-2 py-1">${order.equipo}</td>
            <td class="px-2 py-1">${order.estilo}</td>
            <td class="px-2 py-1 text-center">${order.cantidad || 0}</td>
            <td class="px-2 py-1 text-center">${order.childPieces ?? "-"}</td>
            <td class="px-2 py-1">${order.designer || "-"}</td>
            <td class="px-2 py-1">${order.customStatus || "-"}</td>
            <td class="px-2 py-1">${order.fechaDespacho || "-"}</td>
        `;

        tbody.appendChild(tr);
    }

    // Indicador de página
    const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
    if (pageIndicator)
        pageIndicator.textContent = `${currentPage} / ${totalPages || 1}`;
}



/* ============================================================
   21. PAGINACIÓN
   ============================================================ */

safeAddEventListener("prevPageBtn", "click", () => {
    if (currentPage > 1) {
        currentPage--;
        updateTable();
    }
});

safeAddEventListener("nextPageBtn", "click", () => {
    const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
    if (currentPage < totalPages) {
        currentPage++;
        updateTable();
    }
});



/* ============================================================
   22. FILTROS AVANZADOS (Visibles y Corregidos)
   ============================================================ */

// Buscador
safeAddEventListener("searchInput", "input", (e) => {
    currentSearchTerm = e.target.value.toLowerCase().trim();
    currentPage = 1;
    rebuildFilteredOrders();
    updateTable();
});

// Filtro por estado
safeAddEventListener("statusFilter", "change", (e) => {
    currentStatusFilter = e.target.value;
    currentPage = 1;
    rebuildFilteredOrders();
    updateTable();
});

// Filtro por diseñador
safeAddEventListener("designerFilter", "change", (e) => {
    currentDesignerFilter = e.target.value;
    currentPage = 1;
    rebuildFilteredOrders();
    updateTable();
});

// Filtro por departamento (arreglado)
safeAddEventListener("departmentFilter", "change", (e) => {
    currentDepartmentFilter = e.target.value;
    currentPage = 1;
    rebuildFilteredOrders();
    updateTable();
});



/* ============================================================
   23. VISIBILIDAD: Mostrar qué filtro está activo (tu solicitud)
   ============================================================ */

function updateFilterLabels() {
    const labelEstado = document.getElementById("filterLabelEstado");
    const labelDepto = document.getElementById("filterLabelDepto");
    const labelDesigner = document.getElementById("filterLabelDesigner");

    if (labelEstado)
        labelEstado.textContent = `Estado: ${currentStatusFilter}`;
    if (labelDepto)
        labelDepto.textContent = `Depto: ${currentDepartmentFilter}`;
    if (labelDesigner)
        labelDesigner.textContent = `Diseñador: ${currentDesignerFilter}`;
}

// Cada vez que se actualiza tabla → refrescar etiquetas
function refreshUIAfterFilters() {
    updateFilterLabels();
    updateTable();
}



/* ============================================================
   24. NOTIFICACIONES — COMPLETAS Y FUNCIONALES
   ============================================================ */

let notifications = [];
let unreadCount = 0;

function addNotification(message, type = "info") {
    const time = new Date().toLocaleTimeString("es-DO", {
        hour: "2-digit",
        minute: "2-digit"
    });

    notifications.unshift({
        message,
        type,
        time
    });

    unreadCount++;
    updateNotificationUI();
}

function updateNotificationUI() {
    const badge = document.getElementById("notificationBadge");
    const list = document.getElementById("notificationList");

    if (!badge || !list) return;

    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? "flex" : "none";

    list.innerHTML = "";

    for (const n of notifications.slice(0, 50)) {
        const div = document.createElement("div");
        div.className =
            "p-2 border-b border-slate-200 text-[12px] flex gap-2 items-start";

        div.innerHTML = `
            <span>${
                n.type === "success"
                    ? "🟢"
                    : n.type === "error"
                    ? "🔴"
                    : "🔵"
            }</span>
            <div>
                <p>${n.message}</p>
                <small class="text-slate-500">${n.time}</small>
            </div>
        `;

        list.appendChild(div);
    }
}

safeAddEventListener("notificationBtn", "click", () => {
    const dd = document.getElementById("notificationDropdown");
    if (!dd) return;
    dd.classList.toggle("hidden");

    unreadCount = 0;
    updateNotificationUI();
});

document.addEventListener("click", (e) => {
    const dd = document.getElementById("notificationDropdown");
    const btn = document.getElementById("notificationBtn");

    if (!dd || !btn) return;

    if (!dd.contains(e.target) && !btn.contains(e.target)) {
        dd.classList.add("hidden");
    }
});



/* ============================================================
   25. DASHBOARD — MÉTRICAS DEL DEPARTAMENTO
   ============================================================ */

function updateDashboardMetrics() {
    const total = allOrders.length;
    const completadas = allOrders.filter(
        (o) => o.customStatus === "Completada"
    ).length;
    const pendientes = allOrders.filter(
        (o) => !o.customStatus || o.customStatus === "Pendiente"
    ).length;
    const urgentes = allOrders.filter((o) => {
        if (!o.fechaDespacho) return false;
        const despacho = new Date(o.fechaDespacho);
        const hoy = new Date();
        const diff = (despacho - hoy) / 86400000;
        return diff <= 2;
    }).length;

    setDashboardValue("dashTotalOrdenes", total);
    setDashboardValue("dashOrdenesCompletadas", completadas);
    setDashboardValue("dashOrdenesPendientes", pendientes);
    setDashboardValue("dashOrdenesUrgentes", urgentes);
}

function setDashboardValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}



/* ============================================================
   26. CHARTS — RENDERIZADO RÁPIDO (placeholders)
   ============================================================ */

function updateCharts() {
    // Aquí solo dejamos hooks. Chart.js vendrá en la versión 6/6.
    // Pero esta función debe existir ahora para que no rompa el flujo.
}
/* ============================================================
   27. GESTIÓN DE DISEÑADORES
   ============================================================ */

function populateDesignersDropdown() {
    const select = document.getElementById("designerFilter");
    const assignSelect = document.getElementById("designerAssignSelect");
    if (!select) return;

    const designers = [...firebaseDesignersMap.values()]
        .sort((a, b) => a.name.localeCompare(b.name));

    select.innerHTML = `<option value="Todos">Todos</option>`;
    designers.forEach((d) => {
        select.innerHTML += `<option value="${d.name}">${d.name}</option>`;
    });

    // Modal de asignación
    if (assignSelect) {
        assignSelect.innerHTML = "";
        designers.forEach((d) => {
            assignSelect.innerHTML += `<option value="${d.name}">${d.name}</option>`;
        });
    }
}

// Crear diseñador
safeAddEventListener("addDesignerBtn", "click", () => {
    const name = document.getElementById("newDesignerName").value.trim();
    if (!name) {
        showCustomAlert("Nombre del diseñador requerido.", "warning");
        return;
    }

    db_firestore
        .collection("designers")
        .add({
            name,
            createdAt: new Date().toISOString()
        })
        .then(() => {
            showCustomAlert("Diseñador agregado.", "success");
            document.getElementById("newDesignerName").value = "";
        })
        .catch(() => showCustomAlert("Error agregando diseñador.", "error"));
});

// Eliminar diseñador
function deleteDesigner(designerId, designerName) {
    showConfirmModal(
        `¿Deseas eliminar al diseñador "${designerName}"? Esto moverá todas sus órdenes a "Sin asignar".`,
        async () => {
            try {
                await db_firestore.collection("designers").doc(designerId).delete();

                showCustomAlert("Diseñador eliminado.", "success");

                // Remover asignaciones
                const batch = db_firestore.batch();

                firebaseAssignmentsMap.forEach((value, orderId) => {
                    if (value.designer === designerName) {
                        const ref = db_firestore.collection("assignments").doc(orderId);
                        batch.update(ref, { designer: "" });
                    }
                });

                await batch.commit();
                showCustomAlert("Órdenes actualizadas.", "success");

            } catch (err) {
                console.error(err);
                showCustomAlert("Error eliminando diseñador.", "error");
            }
        },
        true // CONFIRMAR estricto
    );
}



/* ============================================================
   28. GENERAR REPORTE SEMANAL (CON SPINNER FIX)
   ============================================================ */

safeAddEventListener("generateWeeklyReportBtn", "click", generateWeeklyReport);

async function generateWeeklyReport() {
    const modal = document.getElementById("weeklyReportModal");
    const spinner = document.getElementById("weeklyReportSpinner");
    const content = document.getElementById("weeklyReportContent");

    if (!spinner || !content) {
        console.error("Falta el elemento weeklyReportSpinner o content");
        return;
    }

    spinner.classList.remove("hidden");
    content.innerHTML = "";

    modal.classList.add("active");
    document.body.classList.add("modal-open");

    await new Promise((res) => setTimeout(res, 400));

    const now = new Date();
    const inicio = new Date(now);
    inicio.setDate(now.getDate() - 7);

    const data = allOrders.filter((o) => {
        if (!o.fechaDespacho) return false;
        const fd = new Date(o.fechaDespacho);
        return fd >= inicio && fd <= now;
    });

    let html = `<h3 class="font-bold mb-2 text-slate-700">Reporte semanal (${data.length} órdenes)</h3>`;

    for (const o of data) {
        html += `
            <div class="border-b py-1 text-[12px]">
                <strong>${o.id}</strong> — ${o.cliente} — ${o.equipo}
                <br><span class="text-slate-500">Despacho: ${o.fechaDespacho}</span>
            </div>
        `;
    }

    content.innerHTML = html;
    spinner.classList.add("hidden");
}



/* ============================================================
   29. MODALES (ABRIR / CERRAR)
   ============================================================ */

function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add("active");
    document.body.classList.add("modal-open");
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove("active");

    const active = document.querySelector(".modal-overlay.active");
    if (!active) document.body.classList.remove("modal-open");
}

// Cerrar modales al hacer clic en close-btn
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-close-btn")) {
        const modal = e.target.closest(".modal-overlay");
        if (modal) closeModal(modal.id);
    }
});



/* ============================================================
   30. UTILIDADES FINALES
   ============================================================ */

function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
}

function uid() {
    return "_" + Math.random().toString(36).substr(2, 9);
}



/* ============================================================
   31. INICIALIZACIÓN GENERAL DE LA APP
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    console.log("Panel Arte cargado.");
    initAuth(); // Activa login + listeners
});
