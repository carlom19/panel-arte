// ======================================================
// ========== APP.JS - PANEL ARTE v7.1 ENTERPRISE ==========
// ========== PARTE 1/?? — ESTRUCTURA BASE ================
// ======================================================

/*
   Nota para Carlos:
   Esta es la estructura COMPLETA del archivo. Aquí estoy creando
   TODAS las secciones principales para que nada quede fuera de lugar.
   Luego, en las próximas partes voy llenando cada módulo.
*/

// ======================================================
// ===== 1. CONFIGURACIÓN GLOBAL Y VARIABLES =============
// ======================================================

/* ------------------------------------------------------
   CONFIGURACIÓN FIREBASE (LEGACY COMPAT MODE)
------------------------------------------------------ */

const firebaseConfig = {
    apiKey: "AIzaSyCkSjL6oL-dqOY8H33VJuZzQ8i-mu-Hiyc",
    authDomain: "fitwell-arte.firebaseapp.com",
    projectId: "fitwell-arte",
    storageBucket: "fitwell-arte.appspot.com",
    messagingSenderId: "703959389829",
    appId: "1:703959389829:web:f15794f67a7e567aca51b9"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ------------------------------------------------------
   VARIABLES GLOBALES DEL SISTEMA
------------------------------------------------------ */

let rawOrders = [];                // Órdenes originales desde Excel
let filteredOrders = [];           // Órdenes filtradas
let designerList = [];             // Lista de diseñadores
let teamList = [];                 // Lista de teams
let clientList = [];               // Lista de clientes
let styleList = [];                // Lista de estilos
let watchersEnabled = false;       // Control para listeners

// Estado para la tabla
let currentPage = 1;
let rowsPerPage = 50;
let totalPages = 1;

// Estado de filtros
let filterState = {
    search: "",
    client: "",
    style: "",
    team: "",
    departamento: "",
    designer: "",
    customStatus: "",
    dateFrom: "",
    dateTo: "",
    quickStatus: "" // veryLate | aboutToExpire | etc
};

/* ------------------------------------------------------
   CACHE LOCAL
------------------------------------------------------ */

let cache = {
    lastUpdate: null,
    tableHTML: "",
    summaryMetrics: {},
};

/* ------------------------------------------------------
   UTILIDADES GENERALES
------------------------------------------------------ */

function showAlert(message, type = "info") {
    const box = document.getElementById("customAlert");
    if (!box) return;

    const colors = {
        info: "blue",
        success: "green",
        error: "red",
        warning: "yellow",
    };

    const color = colors[type] || "blue";

    box.innerHTML = `
        <div class="p-4 flex items-start gap-3">
            <div class="w-8 h-8 rounded-md bg-${color}-100 flex items-center justify-center text-${color}-600">
                <i class="fa-solid fa-circle-info"></i>
            </div>
            <div class="text-sm font-medium text-slate-700">${message}</div>
        </div>
    `;

    box.style.display = "block";
    box.style.opacity = 1;

    setTimeout(() => {
        box.style.opacity = 0;
        setTimeout(() => (box.style.display = "none"), 300);
    }, 2500);
}

/* ------------------------------------------------------
   LOADING STATE
------------------------------------------------------ */

function setLoading(isLoading) {
    const app = document.getElementById("appMainContainer");
    if (!app) return;

    if (isLoading) {
        app.classList.add("opacity-50", "pointer-events-none");
    } else {
        app.classList.remove("opacity-50", "pointer-events-none");
    }
}

/* ------------------------------------------------------
   DEBOUNCE UTIL
------------------------------------------------------ */

function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
}

/* ------------------------------------------------------
   VALIDACIONES BÁSICAS
------------------------------------------------------ */

function safe(val) {
    return val === undefined || val === null ? "" : String(val).trim();
}

function toDate(excelDate) {
    if (!excelDate) return null;
    if (excelDate instanceof Date) return excelDate;
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + excelDate * 86400000);
}

// (Firebase Config + Variables Globales irán aquí — ya las tienes pero se reorganizarán)

// ======================================================
// ===== 2. SISTEMA DE NAVEGACIÓN DE VISTAS ==============
// ======================================================

/* ------------------------------------------------------
   SISTEMA DE VISTAS (SIDEBAR + MAIN VIEWS)
------------------------------------------------------ */

const views = [
    "dashboard",
    "kanbanView",
    "workPlanView",
    "designerMetricsView",
    "departmentMetricsView"
];

function hideAllViews() {
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

function activarNav(view) {
    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.classList.remove("bg-slate-100", "text-slate-900");
    });

    const navBtn = document.getElementById(`nav-${view}`);
    if (navBtn) navBtn.classList.add("bg-slate-100", "text-slate-900");
}

function navigateTo(view) {
    if (!views.includes(view)) {
        console.warn("Vista no existe:", view);
        return;
    }

    hideAllViews();
    activarNav(view);

    const target = document.getElementById(view);
    if (target) target.style.display = "block";

    // Comportamiento por vista
    switch (view) {
        case "dashboard":
            updateDashboard();
            updateTable();
            break;
        case "kanbanView":
            generarKanban();
            break;
        case "workPlanView":
            generateWorkPlan();
            break;
        case "designerMetricsView":
            generateDesignerMetrics();
            break;
        case "departmentMetricsView":
            generateDepartmentMetrics();
            break;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ------------------------------------------------------
   CONTROL DE LOGIN Y MOSTRAR APP PRINCIPAL
------------------------------------------------------ */

function mostrarApp() {
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("uploadSection").style.display = "none";
    document.getElementById("mainNavigation").style.display = "block";
    document.getElementById("appMainContainer").style.display = "block";

    navigateTo("dashboard");
}

function mostrarUpload() {
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("uploadSection").style.display = "block";
    document.getElementById("mainNavigation").style.display = "none";
    document.getElementById("appMainContainer").style.display = "none";
}

function mostrarLogin() {
    document.getElementById("loginSection").style.display = "block";
    document.getElementById("uploadSection").style.display = "none";
    document.getElementById("mainNavigation").style.display = "none";
    document.getElementById("appMainContainer").style.display = "none";
}

/* ------------------------------------------------------
   TOGGLE DEL SIDEBAR (EN MÓVIL FUTURAMENTE)
------------------------------------------------------ */

let sidebarOpen = true;

function toggleSidebar() {
    const nav = document.getElementById("mainNavigation");
    if (!nav) return;

    sidebarOpen = !sidebarOpen;
    nav.style.transform = sidebarOpen ? "translateX(0)" : "translateX(-100%)";
}
// ======================================================

// navigateTo(view)
// activarNav(viewId)
// hideAllViews()

// ======================================================
// ===== 3. SISTEMA DE NOTIFICACIONES ====================
// ======================================================

/* ------------------------------------------------------
   TOGGLE DEL DROPDOWN DE NOTIFICACIONES
------------------------------------------------------ */

function toggleNotifications() {
    const dropdown = document.getElementById("notificationDropdown");
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains("hidden");

    if (isHidden) {
        dropdown.classList.remove("hidden");
        dropdown.classList.add("animate-fadeIn");
    } else {
        dropdown.classList.add("hidden");
        dropdown.classList.remove("animate-fadeIn");
    }
}

/* ------------------------------------------------------
   CERRAR DROPDOWN SI SE HACE CLICK FUERA
------------------------------------------------------ */

document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("notificationDropdown");
    const button = document.getElementById("notificationBtn");

    if (!dropdown || !button) return;

    // Si el dropdown está oculto no hacemos nada
    if (dropdown.classList.contains("hidden")) return;

    // Clic fuera del botón y del dropdown
    if (!dropdown.contains(e.target) && !button.contains(e.target)) {
        dropdown.classList.add("hidden");
    }
});

/* ------------------------------------------------------
   RENDER DE NOTIFICACIONES EN EL DROPDOWN
------------------------------------------------------ */

function updateNotificationUI(notificationDocs = []) {
    const badge = document.getElementById("notificationBadge");
    const personalList = document.getElementById("notif-personal");
    const systemList = document.getElementById("notif-system");

    if (!badge || !personalList || !systemList) return;

    personalList.innerHTML = "";
    systemList.innerHTML = "";

    let unreadCount = 0;

    notificationDocs.forEach(notif => {
        const data = notif.data();
        if (!data) return;

        const html = `
            <div class="p-3 hover:bg-slate-50 cursor-pointer transition" data-id="${notif.id}">
                <p class="text-xs font-bold text-slate-700">${safe(data.title)}</p>
                <p class="text-[10px] text-slate-500">${safe(data.message)}</p>
                <p class="text-[9px] text-slate-400 mt-1">${new Date(data.timestamp).toLocaleString()}</p>
            </div>
        `;

        if (data.type === "system") {
            systemList.innerHTML += html;
        } else {
            personalList.innerHTML += html;
        }

        if (!data.read) unreadCount++;
    });

    // Mostrar badge si hay no leídas
    if (unreadCount > 0) {
        badge.classList.remove("hidden");
        badge.textContent = unreadCount;
    } else {
        badge.classList.add("hidden");
    }
}

/* ------------------------------------------------------
   MARCAR NOTIFICACIÓN COMO LEÍDA AL CLIC
------------------------------------------------------ */

document.getElementById("notificationDropdown").addEventListener("click", async (e) => {
    const notifElement = e.target.closest("[data-id]");
    if (!notifElement) return;

    const id = notifElement.getAttribute("data-id");

    try {
        await db.collection("notifications").doc(id).update({ read: true });
    } catch (err) {
        console.error("Error al marcar como leída:", err);
    }
});

/* ------------------------------------------------------
   LISTENER EN TIEMPO REAL (PERSONALES + SISTEMA)
------------------------------------------------------ */

let unsubscribeNotifications = null;

function listenToMyNotifications(userEmail) {
    if (unsubscribeNotifications) unsubscribeNotifications();

    unsubscribeNotifications = db.collection("notifications")
        .where("target", "in", [userEmail, "*system"])
        .orderBy("timestamp", "desc")
        .limit(50)
        .onSnapshot((snapshot) => {
            updateNotificationUI(snapshot.docs);
        });
}
// ======================================================

// toggleNotifications()
// cerrarDropdownNotificaciones()
// updateNotificationUI(docs)
// handleNotificationClick()

// ======================================================
// ===== 4. TABLA PRINCIPAL (CORE UI) ====================
// ======================================================

/* ------------------------------------------------------
   MOTOR DE FILTRADO PRINCIPAL
------------------------------------------------------ */

function getFilteredOrders() {
    let data = [...rawOrders];

    // BUSCADOR GENERAL
    if (filterState.search) {
        const q = filterState.search.toLowerCase();
        data = data.filter(o =>
            safe(o.Cliente).toLowerCase().includes(q) ||
            safe(o.Estilo).toLowerCase().includes(q) ||
            safe(o.Team).toLowerCase().includes(q) ||
            safe(o.Codigo).toLowerCase().includes(q)
        );
    }

    // FILTROS SELECT
    if (filterState.client) data = data.filter(o => o.Cliente === filterState.client);
    if (filterState.style) data = data.filter(o => o.Estilo === filterState.style);
    if (filterState.team) data = data.filter(o => o.Team === filterState.team);
    if (filterState.departamento) data = data.filter(o => o.Departamento === filterState.departamento);
    if (filterState.designer) data = data.filter(o => o.Diseniador === filterState.designer);
    if (filterState.customStatus) data = data.filter(o => o.CustomStatus === filterState.customStatus);

    // RANGO DE FECHAS
    if (filterState.dateFrom) {
        const from = new Date(filterState.dateFrom);
        data = data.filter(o => new Date(o.Fecha) >= from);
    }
    if (filterState.dateTo) {
        const to = new Date(filterState.dateTo);
        data = data.filter(o => new Date(o.Fecha) <= to);
    }

    // ESTADOS RÁPIDOS
    if (filterState.quickStatus === "veryLate") {
        data = data.filter(o => o.EsAtrasada === true);
    }
    if (filterState.quickStatus === "aboutToExpire") {
        data = data.filter(o => o.PorVencer === true);
    }

    filteredOrders = data;
    calcularPaginacion();
}

/* ------------------------------------------------------
   SISTEMA DE PAGINACIÓN
------------------------------------------------------ */

function calcularPaginacion() {
    totalPages = Math.max(1, Math.ceil(filteredOrders.length / rowsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
}

/* ------------------------------------------------------
   UPDATE TABLE (RENDER COMPLETO)
------------------------------------------------------ */

function updateTable() {
    getFilteredOrders();

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const slice = filteredOrders.slice(start, end);

    renderTableRows(slice);
    renderPagination();
}

/* ------------------------------------------------------
   RENDER DE FILAS DE LA TABLA
------------------------------------------------------ */

function renderTableRows(rows) {
    const tbody = document.getElementById("ordersTbody");
    if (!tbody) return;

    tbody.innerHTML = rows.map(o => {
        let lateClass = o.EsAtrasada ? "text-red-600 font-bold" : "";
        let expiringClass = o.PorVencer ? "text-yellow-600 font-bold" : "";

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
                <td class="px-3 py-2">${safe(o.Codigo)}</td>
                <td class="px-3 py-2">${safe(o.Cliente)}</td>
                <td class="px-3 py-2">${safe(o.Team)}</td>
                <td class="px-3 py-2">${safe(o.Estilo)}</td>
                <td class="px-3 py-2 ${lateClass} ${expiringClass}">${safe(o.Fecha)}</td>
                <td class="px-3 py-2">${safe(o.Diseniador)}</td>
                <td class="px-3 py-2">${safe(o.Departamento)}</td>
                <td class="px-3 py-2">${safe(o.CustomStatus)}</td>
                <td class="px-3 py-2 text-right">
                    <button class="px-2 py-1 rounded bg-blue-50 text-blue-600 border border-blue-200 text-[10px]" onclick="openAssignModal('${o.id}')">Asignar</button>
                </td>
            </tr>
        `;
    }).join("");
}

/* ------------------------------------------------------
   PAGINACIÓN VISUAL
------------------------------------------------------ */

function renderPagination() {
    const box = document.getElementById("paginationBox");
    if (!box) return;

    let html = "";

    for (let i = 1; i <= totalPages; i++) {
        const active = i === currentPage ? "bg-blue-600 text-white" : "bg-white text-slate-600";
        html += `
            <button onclick="goToPage(${i})" class="px-3 py-1 border border-slate-200 rounded text-xs mx-1 ${active}">${i}</button>
        `;
    }

    box.innerHTML = html;
}

function goToPage(p) {
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    updateTable();
}
// ======================================================

// updateTable()
// renderTableRows()
// renderPagination()
// calcularPaginacion()

// ======================================================
// ===== 5. DASHBOARD ====================================
// ======================================================

/* ------------------------------------------------------
   DASHBOARD — MÉTRICAS PRINCIPALES
------------------------------------------------------ */

function updateDashboard() {
    if (!rawOrders || rawOrders.length === 0) return;

    let total = rawOrders.length;
    let totalPieces = 0;
    let late = 0;
    let expiring = 0;
    let onTime = 0;
    let thisWeek = 0;

    const today = new Date();
    const weekEnd = new Date();
    weekEnd.setDate(today.getDate() + (7 - today.getDay()));

    rawOrders.forEach(o => {
        const fecha = new Date(o.Fecha);
        const piezas = Number(o.Piezas) || 0;
        totalPieces += piezas;

        if (o.EsAtrasada) late++;
        else if (o.PorVencer) expiring++;
        else onTime++;

        if (fecha >= today && fecha <= weekEnd) thisWeek++;
    });

    document.getElementById("statTotal").textContent = total;
    document.getElementById("statTotalPieces").textContent = totalPieces;
    document.getElementById("statLate").textContent = late;
    document.getElementById("statExpiring").textContent = expiring;
    document.getElementById("statOnTime").textContent = onTime;
    document.getElementById("statThisWeek").textContent = thisWeek;

    generarTopClientes();
    generarCargaTrabajo();
}

/* ------------------------------------------------------
   TOP CLIENTES (LISTA LATERAL)
------------------------------------------------------ */

function generarTopClientes() {
    const reportBox = document.getElementById("clientReport");
    if (!reportBox) return;

    const map = {};

    rawOrders.forEach(o => {
        if (!map[o.Cliente]) map[o.Cliente] = 0;
        map[o.Cliente] += Number(o.Piezas) || 0;
    });

    const sorted = Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    reportBox.innerHTML = sorted
        .map(([cliente, piezas]) => `
            <div class="flex justify-between items-center py-1 border-b border-slate-50 text-xs">
                <span class="text-slate-600">${cliente}</span>
                <span class="font-bold text-slate-800">${piezas}</span>
            </div>
        `)
        .join("");
}

/* ------------------------------------------------------
   CARGA DE TRABAJO (LISTA LATERAL)
------------------------------------------------------ */

function generarCargaTrabajo() {
    const box = document.getElementById("workloadList");
    const totalLabel = document.getElementById("workloadTotal");
    if (!box || !totalLabel) return;

    const map = {};
    let total = 0;

    rawOrders.forEach(o => {
        const d = o.Diseniador || "Sin asignar";
        const piezas = Number(o.Piezas) || 0;

        if (!map[d]) map[d] = 0;
        map[d] += piezas;
        total += piezas;
    });

    totalLabel.textContent = `${total} piezas`;

    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);

    box.innerHTML = sorted
        .map(([diseniador, piezas]) => `
            <div class="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100 text-xs">
                <span class="text-slate-600">${diseniador}</span>
                <span class="font-bold text-slate-800">${piezas}</span>
            </div>
        `)
        .join("");
}
// ======================================================

// updateDashboard()
// generarTopClientes()
// generarCargaTrabajo()

// ======================================================
// ===== 6. KANBAN =======================================
// ======================================================

/* ------------------------------------------------------
   DEFINICIÓN DE COLUMNAS KANBAN
------------------------------------------------------ */

const kanbanColumns = [
    { id: "Bandeja", label: "Bandeja" },
    { id: "Producción", label: "Producción" },
    { id: "Auditoría", label: "Auditoría" },
    { id: "Completada", label: "Completada" }
];

/* ------------------------------------------------------
   GENERAR KANBAN COMPLETO
------------------------------------------------------ */

function generarKanban() {
    const container = document.getElementById("kanbanContainer");
    if (!container) return;

    container.innerHTML = kanbanColumns
        .map(col => `
            <div class="kanban-col" data-col="${col.id}">
                <h3 class="kanban-title">${col.label}</h3>
                <div class="kanban-list" id="kanban-${col.id}"></div>
            </div>
        `)
        .join("");

    renderKanbanColumns();
    activarDragAndDrop();
}

/* ------------------------------------------------------
   RENDERIZAR COLUMNAS DEL KANBAN
------------------------------------------------------ */

function renderKanbanColumns() {
    if (!rawOrders || rawOrders.length === 0) return;

    kanbanColumns.forEach(col => {
        const list = document.getElementById(`kanban-${col.id}`);
        if (!list) return;

        const orders = rawOrders.filter(o => o.CustomStatus === col.id);

        list.innerHTML = orders
            .map(o => `
                <div class="kanban-card" draggable="true" data-id="${o.id}">
                    <p class="kanban-code">${safe(o.Codigo)}</p>
                    <p class="kanban-client">${safe(o.Cliente)}</p>
                    <p class="kanban-team text-[10px] text-slate-500">${safe(o.Team)}</p>
                    <p class="kanban-designer text-[10px]">${safe(o.Diseniador || "Sin asignar")}</p>
                </div>
            `)
            .join("");
    });
}

/* ------------------------------------------------------
   DRAG & DROP PRINCIPAL
------------------------------------------------------ */

function activarDragAndDrop() {
    const cards = document.querySelectorAll(".kanban-card");
    const lists = document.querySelectorAll(".kanban-list");

    cards.forEach(card => {
        card.addEventListener("dragstart", dragStart);
    });

    lists.forEach(list => {
        list.addEventListener("dragover", dragOver);
        list.addEventListener("drop", dropCard);
    });
}

let draggedCard = null;

function dragStart(e) {
    draggedCard = e.target;
    e.dataTransfer.effectAllowed = "move";
}

function dragOver(e) {
    e.preventDefault(); // Necesario para permitir drop
}

async function dropCard(e) {
    e.preventDefault();
    if (!draggedCard) return;

    const newCol = this.getAttribute("id").replace("kanban-", "");
    const orderId = draggedCard.getAttribute("data-id");

    await actualizarKanbanFirebase(orderId, newCol);
    draggedCard = null;
}

/* ------------------------------------------------------
   ACTUALIZAR ESTADO EN FIREBASE
------------------------------------------------------ */

async function actualizarKanbanFirebase(orderId, newStatus) {
    try {
        await db.collection("orders").doc(orderId).update({ CustomStatus: newStatus });

        // Actualizar local
        const obj = rawOrders.find(o => o.id === orderId);
        if (obj) obj.CustomStatus = newStatus;

        renderKanbanColumns();
        updateDashboard();
        updateTable();

        showAlert(`Orden movida a ${newStatus}`, "success");
    } catch (err) {
        console.error("Error actualizando Kanban", err);
        showAlert("Error actualizando estado", "error");
    }
}
// ======================================================

// generarKanban()
// renderKanbanColumns()
// moverOrdenKanban()
// actualizarKanbanFirebase()

// ======================================================
// ===== 7. PLAN SEMANAL =================================
// ======================================================

/* ------------------------------------------------------
   GENERAR PLAN SEMANAL COMPLETO
------------------------------------------------------ */

function generateWorkPlan() {
    const container = document.getElementById("workPlanContainer");
    if (!container) return;

    const days = obtenerSemanaActual();

    container.innerHTML = days
        .map(d => `
            <div class="wp-col" data-day="${d.fechaISO}">
                <h3 class="wp-title">${d.label}</h3>
                <div class="wp-list" id="wp-${d.fechaISO}"></div>
            </div>
        `)
        .join("");

    renderWorkPlanLists();
    activarDragAndDropPlan();
}

/* ------------------------------------------------------
   OBTENER SEMANA ACTUAL (LUNES → DOMINGO)
------------------------------------------------------ */

function obtenerSemanaActual() {
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - hoy.getDay() + 1);

    const dias = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date(lunes);
        d.setDate(lunes.getDate() + i);

        dias.push({
            label: d.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "2-digit" }),
            fechaISO: d.toISOString().substring(0, 10)
        });
    }

    return dias;
}

/* ------------------------------------------------------
   RENDER DE LISTAS DEL PLAN SEMANAL
------------------------------------------------------ */

function renderWorkPlanLists() {
    if (!rawOrders || rawOrders.length === 0) return;

    const dias = obtenerSemanaActual();

    dias.forEach(d => {
        const list = document.getElementById(`wp-${d.fechaISO}`);
        if (!list) return;

        const filtered = rawOrders.filter(o => o.Fecha === d.fechaISO);

        list.innerHTML = filtered
            .map(o => `
                <div class="wp-card" draggable="true" data-id="${o.id}">
                    <p class="wp-code">${safe(o.Codigo)}</p>
                    <p class="wp-client">${safe(o.Cliente)}</p>
                    <p class="wp-team text-[10px] text-slate-500">${safe(o.Team)}</p>
                </div>
            `)
            .join("");
    });
}

/* ------------------------------------------------------
   DRAG & DROP PARA PLAN SEMANAL
------------------------------------------------------ */

function activarDragAndDropPlan() {
    const cards = document.querySelectorAll(".wp-card");
    const lists = document.querySelectorAll(".wp-list");

    cards.forEach(card => card.addEventListener("dragstart", wpDragStart));
    lists.forEach(list => {
        list.addEventListener("dragover", wpDragOver);
        list.addEventListener("drop", wpDropCard);
    });
}

let draggedWP = null;

function wpDragStart(e) {
    draggedWP = e.target;
    e.dataTransfer.effectAllowed = "move";
}

function wpDragOver(e) {
    e.preventDefault();
}

async function wpDropCard(e) {
    e.preventDefault();
    if (!draggedWP) return;

    const newDate = this.getAttribute("id").replace("wp-", "");
    const orderId = draggedWP.getAttribute("data-id");

    await actualizarFechaOrden(orderId, newDate);
    draggedWP = null;
}

/* ------------------------------------------------------
   ACTUALIZAR FECHA DE ENTREGA EN FIREBASE
------------------------------------------------------ */

async function actualizarFechaOrden(orderId, newDate) {
    try {
        await db.collection("orders").doc(orderId).update({ Fecha: newDate });

        const obj = rawOrders.find(o => o.id === orderId);
        if (obj) obj.Fecha = newDate;

        renderWorkPlanLists();
        updateDashboard();
        updateTable();

        showAlert(`Orden movida al día ${newDate}`, "success");
    } catch (err) {
        console.error("Error actualizando fecha del plan semanal", err);
        showAlert("Error actualizando fecha", "error");
    }
}
// ======================================================

// generateWorkPlan()
// agregarOrdenAPlan()
// removeOrderFromPlan()

// ======================================================
// ===== 8. MÉTRICAS =====================================
// ======================================================

/* ------------------------------------------------------
   MÉTRICAS DE DISEÑADOR (CHART.JS)
------------------------------------------------------ */

let designerMetricsChart = null;

function generateDesignerMetrics() {
    const ctx = document.getElementById("designerMetricsChart");
    if (!ctx) return;

    const map = {};

    rawOrders.forEach(o => {
        const d = o.Diseniador || "Sin asignar";
        if (!map[d]) map[d] = 0;
        map[d] += Number(o.Piezas) || 0;
    });

    const labels = Object.keys(map);
    const values = Object.values(map);

    if (designerMetricsChart) designerMetricsChart.destroy();

    designerMetricsChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Piezas por Diseñador",
                data: values,
                backgroundColor: "rgba(37, 99, 235, 0.5)",
                borderColor: "rgba(37, 99, 235, 1)",
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

/* ------------------------------------------------------
   MÉTRICAS GLOBALES DEL DEPARTAMENTO
------------------------------------------------------ */

let departmentMetricsChart = null;

function generateDepartmentMetrics() {
    const ctx = document.getElementById("departmentMetricsChart");
    if (!ctx) return;

    let atrasadas = 0;
    let porVencer = 0;
    let aTiempo = 0;

    rawOrders.forEach(o => {
        if (o.EsAtrasada) atrasadas++;
        else if (o.PorVencer) porVencer++;
        else aTiempo++;
    });

    const labels = ["Atrasadas", "Por Vencer", "A Tiempo"];
    const values = [atrasadas, porVencer, aTiempo];
    const colors = ["#dc2626", "#facc15", "#16a34a"]; // rojo, amarillo, verde

    if (departmentMetricsChart) departmentMetricsChart.destroy();

    departmentMetricsChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { font: { size: 11 } }
                }
            }
        }
    });
}
// ======================================================

// generateDesignerMetrics()
// generateDepartmentMetrics()

// ======================================================
// ===== 9. CRUD DE ASIGNACIONES =========================
// ======================================================

/* ------------------------------------------------------
   ABRIR MODAL DE ASIGNACIONES CON DATOS DE LA ORDEN
------------------------------------------------------ */

function openAssignModal(orderId) {
    const modal = document.getElementById("assignModal");
    const title = document.getElementById("assignModalTitle");
    const designerSelect = document.getElementById("assignDesigner");
    const deptSelect = document.getElementById("assignDepartment");
    const statusSelect = document.getElementById("assignStatus");
    const notesInput = document.getElementById("assignNotes");

    if (!modal) return;

    const order = rawOrders.find(o => o.id === orderId);
    if (!order) return;

    // Guardar temporalmente
    modal.setAttribute("data-id", orderId);

    // Título
    if (title) title.textContent = `Asignar — ${order.Codigo}`;

    // Diseñadores
    if (designerSelect) {
        designerSelect.innerHTML = designerList
            .map(d => `<option value="${d}">${d}</option>`) 
            .join("");
        designerSelect.value = order.Diseniador || "";
    }

    // Departamentos
    const departamentos = ["Artes", "Sublimación", "Corte", "Costura", "Auditoría", "Despacho"];
    if (deptSelect) {
        deptSelect.innerHTML = departamentos
            .map(d => `<option value="${d}">${d}</option>`) 
            .join("");
        deptSelect.value = order.Departamento || "";
    }

    // Estados de producción
    if (statusSelect) {
        statusSelect.innerHTML = `
            <option value="Bandeja">Bandeja</option>
            <option value="Producción">Producción</option>
            <option value="Auditoría">Auditoría</option>
            <option value="Completada">Completada</option>`;
        statusSelect.value = order.CustomStatus || "Bandeja";
    }

    // Notas
    if (notesInput) notesInput.value = order.Notas || "";

    modal.style.display = "block";
}

/* ------------------------------------------------------
   GUARDAR ASIGNACIÓN EN FIREBASE
------------------------------------------------------ */

async function saveAssignment() {
    const modal = document.getElementById("assignModal");
    if (!modal) return;

    const orderId = modal.getAttribute("data-id");
    const designer = document.getElementById("assignDesigner").value;
    const dept = document.getElementById("assignDepartment").value;
    const status = document.getElementById("assignStatus").value;
    const notes = document.getElementById("assignNotes").value;

    try {
        await db.collection("orders").doc(orderId).update({
            Diseniador: designer,
            Departamento: dept,
            CustomStatus: status,
            Notas: notes
        });

        // Actualizar local
        const obj = rawOrders.find(o => o.id === orderId);
        if (obj) {
            obj.Diseniador = designer;
            obj.Departamento = dept;
            obj.CustomStatus = status;
            obj.Notas = notes;
        }

        updateDashboard();
        updateTable();
        renderKanbanColumns();
        renderWorkPlanLists();

        closeTopModal();
        showAlert("Asignación guardada correctamente", "success");

    } catch (err) {
        console.error("Error guardando asignación", err);
        showAlert("Error guardando la asignación", "error");
    }
}

/* ------------------------------------------------------
   CAMBIAR ESTADO DESDE LA TABLA (SIN MODAL)
------------------------------------------------------ */

async function cambiarEstadoOrden(orderId, newStatus) {
    try {
        await db.collection("orders").doc(orderId).update({ CustomStatus: newStatus });

        const obj = rawOrders.find(o => o.id === orderId);
        if (obj) obj.CustomStatus = newStatus;

        updateDashboard();
        updateTable();
        renderKanbanColumns();

        showAlert(`Estado cambiado a ${newStatus}`, "success");

    } catch (err) {
        console.error("Error cambiando estado", err);
        showAlert("Error cambiando estado", "error");
    }
}
// ======================================================

// openAssignModal(id)
// saveAssignment()
// cambiarEstadoOrden()

// ======================================================
// ===== 10. EXPORTAR EXCEL ===============================
// ======================================================

/* ------------------------------------------------------
   EXPORTAR TABLA FILTRADA A EXCEL (.xlsx)
------------------------------------------------------ */

function exportTableToExcel() {
    if (!filteredOrders || filteredOrders.length === 0) {
        showAlert("No hay datos para exportar", "warning");
        return;
    }

    // Construir hoja limpia
    const exportData = filteredOrders.map(o => ({
        Codigo: safe(o.Codigo),
        Cliente: safe(o.Cliente),
        Team: safe(o.Team),
        Estilo: safe(o.Estilo),
        Fecha: safe(o.Fecha),
        Piezas: safe(o.Piezas),
        Diseñador: safe(o.Diseniador),
        Departamento: safe(o.Departamento),
        Estado: safe(o.CustomStatus),
        Notas: safe(o.Notas || "")
    }));

    // Crear Workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Auto-ajustar ancho de columnas
    const columnWidths = Object.keys(exportData[0]).map(key => ({ wch: Math.max(10, key.length + 5) }));
    ws['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Órdenes Filtradas");

    // Generar nombre de archivo
    const fecha = new Date().toISOString().substring(0, 10);
    const fileName = `Ordenes_Filtradas_${fecha}.xlsx`;

    XLSX.writeFile(wb, fileName);

    showAlert("Exportación completada", "success");
}
// ======================================================

// exportTableToExcel()

// ======================================================
// ===== 11. MODALES =====================================
// ======================================================

/* ------------------------------------------------------
   SISTEMA UNIVERSAL DE MODALES (STACK)
------------------------------------------------------ */

let modalStack = []; // Soporta múltiples modales abiertos

function openModalById(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    modal.style.display = "block";
    modal.classList.add("modal-open");

    modalStack.push(modal);
    document.body.classList.add("overflow-hidden");
}

function closeTopModal() {
    if (modalStack.length === 0) return;

    const modal = modalStack.pop();
    if (!modal) return;

    modal.classList.remove("modal-open");
    modal.style.display = "none";

    if (modalStack.length === 0) {
        document.body.classList.remove("overflow-hidden");
    }
}

function closeAllModals() {
    modalStack.forEach(m => {
        m.classList.remove("modal-open");
        m.style.display = "none";
    });

    modalStack = [];
    document.body.classList.remove("overflow-hidden");
}

/* ------------------------------------------------------
   CLIC FUERA DEL MODAL → CERRAR
------------------------------------------------------ */

document.addEventListener("click", (e) => {
    if (modalStack.length === 0) return;

    const topModal = modalStack[modalStack.length - 1];
    const content = topModal.querySelector(".modal-content");

    if (!content) return;

    // Si clic fuera del contenido → cerrar
    if (!content.contains(e.target) && topModal.contains(e.target)) {
        closeTopModal();
    }
});

/* ------------------------------------------------------
   TECLA ESC → CERRAR MODAL SUPERIOR
------------------------------------------------------ */

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeTopModal();
    }
});

/* ------------------------------------------------------
   UTILIDADES PARA MODALES
------------------------------------------------------ */

function showLegendModal() {
    openModalById("legendModal");
}

function showAssignModal(id) {
    openAssignModal(id);
}
// ======================================================

// openModalById()
// closeTopModal()
// closeAllModals()

// ======================================================
// ===== 12. INICIALIZACIÓN ===============================
// ======================================================

// DOMContentLoaded
// iniciarLoginConGoogle()
// iniciarLogout()

// ======================================================
// ===== 13. LISTENERS Y WATCHERS =========================

/* ------------------------------------------------------
   LISTENERS PRINCIPALES (FILTROS, BUSCADOR, ESTADOS)
------------------------------------------------------ */

document.getElementById("searchInput")?.addEventListener("input", debounce((e) => {
    filterState.search = e.target.value.trim();
    updateTable();
}, 250));

const filterIds = ["clientFilter", "styleFilter", "teamFilter", "deptFilter", "designerFilter", "statusFilter"];

filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", (e) => {
        const key = id.replace("Filter", "");
        filterState[key] = e.target.value;
        updateTable();
    });
});

document.getElementById("dateFrom")?.addEventListener("change", (e) => {
    filterState.dateFrom = e.target.value;
    updateTable();
});

document.getElementById("dateTo")?.addEventListener("change", (e) => {
    filterState.dateTo = e.target.value;
    updateTable();
});

/* ------------------------------------------------------
   BOTONES DE ESTADO RÁPIDO
------------------------------------------------------ */

document.getElementById("btnShowLate")?.addEventListener("click", () => {
    filterState.quickStatus = "veryLate";
    updateTable();
});

document.getElementById("btnShowExpiring")?.addEventListener("click", () => {
    filterState.quickStatus = "aboutToExpire";
    updateTable();
});

document.getElementById("btnShowAll")?.addEventListener("click", () => {
    filterState.quickStatus = "";
    updateTable();
});

/* ------------------------------------------------------
   EXPORTACIÓN EXCEL
------------------------------------------------------ */

document.getElementById("exportExcelBtn")?.addEventListener("click", exportTableToExcel);

/* ------------------------------------------------------
   NAVEGACIÓN DEL SIDEBAR
------------------------------------------------------ */

document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        if (view) navigateTo(view);
    });
});

/* ------------------------------------------------------
   EVENT DELEGATION PARA BOTONES DE TABLA (ASIGNAR)
------------------------------------------------------ */

document.getElementById("ordersTbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-assign-id]");
    if (!btn) return;
    openAssignModal(btn.getAttribute("data-assign-id"));
});

/* ------------------------------------------------------
   REACTIVAR DRAG & DROP CUANDO SE REGENERA LA UI
------------------------------------------------------ */

const observer = new MutationObserver(() => {
    activarDragAndDrop();
    activarDragAndDropPlan();
});

observer.observe(document.getElementById("appMainContainer"), {
    childList: true,
    subtree: true
});

/* ------------------------------------------------------
   WATCHERS FIRESTORE (NOTIFICACIONES Y ÓRDENES EN VIVO)
------------------------------------------------------ */

let unsubscribeOrders = null;

function enableLiveOrders() {
    if (unsubscribeOrders) unsubscribeOrders();

    unsubscribeOrders = db.collection("orders")
        .onSnapshot(snapshot => {
            rawOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            filteredOrders = [...rawOrders];

            updateDashboard();
            updateTable();
            renderKanbanColumns();
            renderWorkPlanLists();
        });
}

/* ------------------------------------------------------
   INICIAR TODA LA APP
------------------------------------------------------ */

window.addEventListener("DOMContentLoaded", async () => {
    await cargarFirestore();
    updateDashboard();
    updateTable();
    generarKanban();
    generateWorkPlan();
    generateDesignerMetrics();
    generateDepartmentMetrics();
});
// ======================================================

// Event delegation
// filtros
// drag & drop

// ======================================================
// ========== PARTE 14 — CARGA DE EXCEL ==================
// ======================================================

/* ------------------------------------------------------
   CAPTURAR ARCHIVO DESDE INPUT
------------------------------------------------------ */

document.getElementById("excelFileInput")?.addEventListener("change", handleExcelUpload);

async function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        showAlert("No seleccionaste ningún archivo", "warning");
        return;
    }

    setLoading(true);

    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

        processExcelData(json);
        showAlert("Archivo procesado correctamente", "success");

    } catch (err) {
        console.error("Error leyendo Excel:", err);
        showAlert("No se pudo procesar el archivo Excel", "error");

    } finally {
        setLoading(false);
    }
}

/* ------------------------------------------------------
   PROCESAR Y NORMALIZAR DATOS DEL EXCEL
------------------------------------------------------ */

async function processExcelData(rows) {
    rawOrders = [];

    const today = new Date();

    for (let row of rows) {
        // Convertir fecha
        let fecha = row.Fecha ? toDate(row.Fecha) : null;
        let fechaISO = fecha ? fecha.toISOString().substring(0, 10) : "";

        // Detección de atraso y por vencer
        const isLate = fecha && fecha < today;
        const isExpiring = fecha && fecha > today && (fecha - today) <= 3 * 86400000;

        const obj = {
            id: crypto.randomUUID(),
            Codigo: safe(row.Codigo),
            Cliente: safe(row.Cliente),
            Team: safe(row.Team),
            Estilo: safe(row.Estilo),
            Piezas: Number(row.Piezas) || 0,
            Fecha: fechaISO,
            Diseniador: safe(row.Diseniador),
            Departamento: safe(row.Departamento),
            CustomStatus: safe(row.CustomStatus) || "Bandeja",
            Notas: safe(row.Notas),
            EsAtrasada: isLate,
            PorVencer: isExpiring,
            Timestamp: Date.now()
        };

        rawOrders.push(obj);
    }

    console.log("Ordenes procesadas:", rawOrders.length);

    actualizarListasGlobales();
    await subirOrdenesAFirebase();
    refrescarTodo();
}

/* ------------------------------------------------------
   GENERAR LISTAS ÚNICAS (SELECTS)
------------------------------------------------------ */

function actualizarListasGlobales() {
    clientList = [...new Set(rawOrders.map(o => o.Cliente).filter(Boolean))].sort();
    teamList = [...new Set(rawOrders.map(o => o.Team).filter(Boolean))].sort();
    styleList = [...new Set(rawOrders.map(o => o.Estilo).filter(Boolean))].sort();
    designerList = [...new Set(rawOrders.map(o => o.Diseniador).filter(Boolean))].sort();
}

/* ------------------------------------------------------
   SUBIR ÓRDENES A FIRESTORE
------------------------------------------------------ */

async function subirOrdenesAFirebase() {
    try {
        const batch = db.batch();

        rawOrders.forEach(o => {
            const ref = db.collection("orders").doc(o.id);
            batch.set(ref, o);
        });

        await batch.commit();
        showAlert("Órdenes guardadas en Firebase", "success");

    } catch (err) {
        console.error("Error subiendo órdenes:", err);
        showAlert("Error guardando datos en Firebase", "error");
    }
}

/* ------------------------------------------------------
   REFRESCAR TODO EL SISTEMA
------------------------------------------------------ */

function refrescarTodo() {
    updateDashboard();
    updateTable();
    generarKanban();
    generateWorkPlan();
}

// ======================================================
// ========== PARTE 15 — LOGIN CON GOOGLE + ROLES =========
// ======================================================

/* ------------------------------------------------------
   VARIABLES DE SESIÓN
------------------------------------------------------ */

let currentUser = null;
let currentUserRole = "viewer"; // admin | artes | sublimacion | costura | auditoria | despacho | viewer

/* ------------------------------------------------------
   BOTÓN DE LOGIN CON GOOGLE
------------------------------------------------------ */

document.getElementById("googleLoginBtn")?.addEventListener("click", loginWithGoogle);

async function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();

    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        if (!user) return;

        await ensureUserInFirestore(user);
        showAlert("Inicio de sesión exitoso", "success");

    } catch (err) {
        console.error("Error en login:", err);
        showAlert("No se pudo iniciar sesión", "error");
    }
}

/* ------------------------------------------------------
   CREAR PERFIL EN FIRESTORE SI NO EXISTE
------------------------------------------------------ */

async function ensureUserInFirestore(user) {
    const ref = db.collection("users").doc(user.email);
    const snap = await ref.get();

    if (!snap.exists) {
        await ref.set({
            email: user.email,
            name: user.displayName || "",
            role: "viewer",  // por defecto
            createdAt: Date.now()
        });
    }
}

/* ------------------------------------------------------
   ESCUCHAR CAMBIO DE AUTENTICACIÓN
------------------------------------------------------ */

auth.onAuthStateChanged(async (user) => {
    if (!user) {
        currentUser = null;
        currentUserRole = "viewer";
        mostrarLogin();
        return;
    }

    currentUser = user;
    await cargarRolUsuario(user.email);

    mostrarApp();
});

/* ------------------------------------------------------
   CARGAR ROL DESDE FIRESTORE
------------------------------------------------------ */

async function cargarRolUsuario(email) {
    try {
        const snap = await db.collection("users").doc(email).get();

        if (snap.exists) {
            currentUserRole = snap.data().role || "viewer";
        } else {
            currentUserRole = "viewer";
        }

        aplicarPermisosDeRol();

    } catch (err) {
        console.error("Error cargando rol:", err);
        currentUserRole = "viewer";
    }
}

/* ------------------------------------------------------
   APLICAR PERMISOS SEGÚN ROL
------------------------------------------------------ */

function aplicarPermisosDeRol() {

    // 🔥 NAV ITEMS
    const navDashboard = document.getElementById("nav-dashboard");
    const navKanban = document.getElementById("nav-kanbanView");
    const navWorkPlan = document.getElementById("nav-workPlanView");
    const navDesignerMetrics = document.getElementById("nav-designerMetricsView");
    const navDeptMetrics = document.getElementById("nav-departmentMetricsView");

    // 🔥 SOLO ADMIN
    if (currentUserRole !== "admin") {
        navDesignerMetrics?.classList.add("hidden");
        navDeptMetrics?.classList.add("hidden");
    }

    // 🔥 ÁREAS RESTRINGIDAS
    if (["auditoria", "despacho"].includes(currentUserRole)) {
        navKanban?.classList.add("hidden");
    }

    // 🔥 VIEWER → casi no puede ver nada
    if (currentUserRole === "viewer") {
        navKanban?.classList.add("hidden");
        navWorkPlan?.classList.add("hidden");
        navDesignerMetrics?.classList.add("hidden");
        navDeptMetrics?.classList.add("hidden");
    }

    // 🔥 Sublimación / Costura / Auditoría solo ven Dashboard + Plan Semanal
    if (["sublimacion", "costura", "auditoria"].includes(currentUserRole)) {
        navKanban?.classList.add("hidden");
    }
}

/* ------------------------------------------------------
   LOGOUT
------------------------------------------------------ */

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    try {
        await auth.signOut();
        showAlert("Sesión cerrada", "info");
        mostrarLogin();
    } catch (err) {
        console.error("Error cerrando sesión:", err);
    }
});

/* ------------------------------------------------------
   PROTECCIÓN DE VISTAS (SEGURIDAD EXTRA)
------------------------------------------------------ */

function protegerVista(vista) {
    if (currentUserRole === "admin") return true;

    const permisos = {
        dashboard: ["admin", "artes", "sublimacion", "costura", "auditoria", "despacho"],
        kanbanView: ["admin", "artes"],
        workPlanView: ["admin", "artes", "sublimacion", "costura", "auditoria"],
        designerMetricsView: ["admin"],
        departmentMetricsView: ["admin"]
    };

    const permitidos = permisos[vista] || [];
    return permitidos.includes(currentUserRole);
}

/* ------------------------------------------------------
   BLOQUEAR ACCESO SI NO TIENE PERMISOS
------------------------------------------------------ */

const oldNavigateTo = navigateTo;

navigateTo = function(view) {
    if (!protegerVista(view)) {
        showAlert("No tienes permiso para ver esta sección", "error");
        return;
    }
    oldNavigateTo(view);
};
// ======================================================
// ========== PARTE 16 — SISTEMA DE AUDITORÍA ============
// ======================================================

/*
   Este módulo registra cualquier cambio que se haga a una orden.
   Se guarda en la colección:
      logs -> { id, orderId, user, action, field, oldValue, newValue, timestamp }
*/

/* ------------------------------------------------------
   FUNCIÓN GENERAL PARA REGISTRAR LOGS
------------------------------------------------------ */

async function registrarLog(orderId, campo, valorAnterior, valorNuevo, accion = "update") {
    try {
        const logRef = db.collection("logs").doc();

        await logRef.set({
            id: logRef.id,
            orderId,
            campo,
            oldValue: valorAnterior ?? "",
            newValue: valorNuevo ?? "",
            action: accion,
            user: currentUser?.email || "unknown",
            timestamp: Date.now()
        });

        console.log("LOG registrado:", { orderId, campo, valorAnterior, valorNuevo });
    } catch (err) {
        console.error("Error registrando log:", err);
    }
}
// ======================================================
// ========== PARTE 17 — LIVE SYNC FIRESTORE =============
// ======================================================

let unsubscribeOrdersListener = null;

/* ------------------------------------------------------
   ACTIVAR WATCHER GLOBAL
------------------------------------------------------ */

function iniciarLiveSync() {
    if (unsubscribeOrdersListener) {
        unsubscribeOrdersListener();
    }

    unsubscribeOrdersListener = db.collection("orders")
        .orderBy("Timestamp", "desc")
        .onSnapshot((snapshot) => {
            console.log("🔄 Actualización en vivo detectada");

            let updatedOrders = [];

            snapshot.forEach(doc => {
                updatedOrders.push(doc.data());
            });

            rawOrders = updatedOrders;

            // Regenerar listas de selects
            clientList = [...new Set(rawOrders.map(o => o.Cliente).filter(Boolean))].sort();
            teamList = [...new Set(rawOrders.map(o => o.Team).filter(Boolean))].sort();
            styleList = [...new Set(rawOrders.map(o => o.Estilo).filter(Boolean))].sort();
            designerList = [...new Set(rawOrders.map(o => o.Diseniador).filter(Boolean))].sort();

            // Refrescar vistas activas
            refrescarVistasActivas();
        });
}

/* ------------------------------------------------------
   DETERMINAR QUÉ VISTA ESTÁ ACTIVA
------------------------------------------------------ */

function refrescarVistasActivas() {
    const dashboardVisible = document.getElementById("dashboard")?.style.display !== "none";
    const kanbanVisible = document.getElementById("kanbanView")?.style.display !== "none";
    const workPlanVisible = document.getElementById("workPlanView")?.style.display !== "none";
    const designerMetricsVisible = document.getElementById("designerMetricsView")?.style.display !== "none";
    const deptMetricsVisible = document.getElementById("departmentMetricsView")?.style.display !== "none";

    if (dashboardVisible) {
        updateDashboard();
        updateTable();
    }

    if (kanbanVisible) {
        renderKanbanColumns();
        activarDragAndDrop();
    }

    if (workPlanVisible) {
        renderWorkPlanLists();
        activarDragAndDropPlan();
    }

    if (designerMetricsVisible) {
        generateDesignerMetrics();
    }

    if (deptMetricsVisible) {
        generateDepartmentMetrics();
    }
}

/* ------------------------------------------------------
   INICIALIZAR LIVE SYNC DESPUÉS DEL LOGIN
------------------------------------------------------ */

auth.onAuthStateChanged((user) => {
    if (user) {
        iniciarLiveSync();
    }
});
// ======================================================
// ========== PARTE 18 — REIMPRESIONES ====================
// ======================================================

/* ------------------------------------------------------
   ABRIR MODAL DE REIMPRESIÓN
------------------------------------------------------ */
function openReprintModal(orderId) {
    const order = rawOrders.find(o => o.id === orderId);
    if (!order) return;

    document.getElementById("reprintModal").setAttribute("data-id", orderId);

    document.getElementById("reprintOrderInfo").innerHTML = `
        <p><b>${order.Codigo}</b> — ${order.Cliente}</p>
        <p class="text-[11px]">${order.Team} / ${order.Estilo}</p>
    `;

    openModalById("reprintModal");
}

/* ------------------------------------------------------
   GUARDAR REIMPRESIÓN EN FIRESTORE
------------------------------------------------------ */
async function guardarReimpresion() {
    const modal = document.getElementById("reprintModal");
    const orderId = modal.getAttribute("data-id");

    const order = rawOrders.find(o => o.id === orderId);
    if (!order) return;

    const tipo = document.getElementById("reprintType").value;
    const notas = document.getElementById("reprintNotes").value;

    try {
        const ref = db.collection("reimpresiones").doc();

        await ref.set({
            id: ref.id,
            orderId,
            codigo: order.Codigo,
            cliente: order.Cliente,
            team: order.Team,
            estilo: order.Estilo,
            tipo,
            notas,
            status: "pendiente",
            reportadoPor: currentUser?.email || "unknown",
            timestamp: Date.now()
        });

        await registrarLog(orderId, "Reimpresión", "-", tipo, "reimpresion");

        showAlert("Reimpresión registrada", "success");
        closeTopModal();
        renderReprintSummary();

    } catch (err) {
        console.error("Error guardando reimpresión:", err);
        showAlert("No se pudo guardar el reporte", "error");
    }
}

