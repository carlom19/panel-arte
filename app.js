// ======================================================
// ===== CONFIGURACIÓN DE FIREBASE Y LIBRERÍAS =====
// ======================================================
const firebaseConfig = {
    apiKey: "AIzaSyAX9jZYnVSGaXdM06I0LTBvbvDpNulMPpk",
    authDomain: "panel-arte.firebaseapp.com",
    projectId: "panel-arte",
    storageBucket: "panel-arte.firebasestorage.app",
    messagingSenderId: "236381043860",
    appId: "1:236381043860:web:f6a9c2cb211dd9161d0881"
};
// Inicializa Firebase
firebase.initializeApp(firebaseConfig);

// Configuración de Tailwind (para uso interno de colores en gráficos)
tailwind.config = {
    theme: {
        extend: {
            fontFamily: { sans: ['Inter', 'sans-serif'] },
            colors: {
                'chart-bandeja': '#F59E0B',
                'chart-produccion': '#8B5CF6',
                'chart-auditoria': '#3B82F6',
                'chart-sin-estado': '#6B7280',
            }
        },
    },
}

// ======================================================
// ===== VARIABLES GLOBALES =====
// ======================================================

// --- Estado de la App ---
let allOrders = []; 
let selectedOrders = new Set();
let currentFilter = 'all';
let currentDateFilter = 'all';
let currentSearch = '';
let currentClientFilter = '';
let currentStyleFilter = '';
let currentTeamFilter = '';
let currentDepartamentoFilter = '';
let currentDesignerFilter = '';
let currentCustomStatusFilter = '';
let currentDateFrom = '';
let currentDateTo = '';
let sortConfig = { key: 'date', direction: 'asc' };
let currentEditingOrderId = null;
let isExcelLoaded = false;

// --- Paginación ---
let currentPage = 1;
let rowsPerPage = 50;
let paginatedOrders = [];

// --- Firebase ---
let usuarioActual = null;
const db_firestore = firebase.firestore();

// --- Mapas de Datos (Caché) ---
let firebaseAssignmentsMap = new Map();
let firebaseHistoryMap = new Map();
let firebaseChildOrdersMap = new Map();
let firebaseDesignersMap = new Map();
let firebaseWeeklyPlanMap = new Map();

// --- Listas y Config ---
let designerList = [];
const CUSTOM_STATUS_OPTIONS = ['Bandeja', 'Producción', 'Auditoría', 'Completada'];
let needsRecalculation = true; 

// --- Gráficos y Vistas ---
let designerDoughnutChart = null;
let designerBarChart = null;
let designerActivityChart = null; 
let currentDesignerTableFilter = { search: '', cliente: '', estado: '', fechaDesde: '', fechaHasta: '' };
let compareChart = null;
let deptLoadPieChart = null;
let deptLoadBarChart = null;
let deptProductivityChart = null;
let currentWorkPlanWeek = '';
let currentCompareDesigner1 = '';


// ======================================================
// ===== INICIALIZACIÓN Y LISTENERS =====
// ======================================================

document.addEventListener('DOMContentLoaded', (event) => {
    console.log('DOM cargado. Inicializando App v5.0 (Cloud)...');
    
    // Auth Listeners
    document.getElementById('loginButton').onclick = iniciarLoginConGoogle;
    document.getElementById('logoutButton').onclick = iniciarLogout;

    // Auth State Change
    firebase.auth().onAuthStateChanged((user) => {
        const loginSection = document.getElementById('loginSection');
        const uploadSection = document.getElementById('uploadSection');
        const dashboard = document.getElementById('dashboard');

        if (user) {
            usuarioActual = user;
            console.log("Usuario conectado:", usuarioActual.displayName);
            document.getElementById('userName').textContent = usuarioActual.displayName;
            
            loginSection.style.display = 'none';
            if (!isExcelLoaded) {
                uploadSection.style.display = 'block';
            } else {
                dashboard.style.display = 'block';
            }
            conectarDatosDeFirebase();
        } else {
            usuarioActual = null;
            isExcelLoaded = false;
            allOrders = [];
            console.log("Usuario desconectado.");
            loginSection.style.display = 'block';
            uploadSection.style.display = 'none';
            dashboard.style.display = 'none';
        }
    });

    // Listeners UI Básicos
    document.getElementById('searchInput').addEventListener('input', debounce((e) => { 
        currentSearch = e.target.value; currentPage = 1; updateTable(); 
    }, 300)); 
    
    document.getElementById('clientFilter').onchange = (e) => { currentClientFilter = e.target.value; currentPage = 1; updateTable(); };
    document.getElementById('styleFilter').onchange = (e) => { currentStyleFilter = e.target.value; currentPage = 1; updateTable(); };
    document.getElementById('teamFilter').onchange = (e) => { currentTeamFilter = e.target.value; currentPage = 1; updateTable(); };
    document.getElementById('departamentoFilter').onchange = (e) => { currentDepartamentoFilter = e.target.value; currentPage = 1; updateTable(); };
    document.getElementById('designerFilter').onchange = (e) => { currentDesignerFilter = e.target.value; currentPage = 1; updateTable(); };
    document.getElementById('customStatusFilter').onchange = (e) => { currentCustomStatusFilter = e.target.value; currentPage = 1; updateTable(); };
    document.getElementById('dateFrom').onchange = (e) => { currentDateFrom = e.target.value; currentPage = 1; updateTable(); };
    document.getElementById('dateTo').onchange = (e) => { currentDateTo = e.target.value; currentPage = 1; updateTable(); };

    // Drag & Drop Excel
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    ['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, preventDefaults, false));
    dropZone.addEventListener('dragenter', () => dropZone.classList.add('border-blue-500', 'bg-gray-100'), false);
    dropZone.addEventListener('dragover', () => dropZone.classList.add('border-blue-500', 'bg-gray-100'), false);
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-blue-500', 'bg-gray-100'), false);
    dropZone.addEventListener('drop', (e) => {
        dropZone.classList.remove('border-blue-500', 'bg-gray-100');
        handleDrop(e);
    }, false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Delegación de Eventos (Botones dinámicos)
    document.getElementById('designerManagerList').addEventListener('click', function(e) {
        const deleteButton = e.target.closest('.btn-delete-designer');
        if (deleteButton) {
            const name = deleteButton.dataset.name;
            const docId = deleteButton.dataset.id;
            if (name && docId) deleteDesigner(docId, name);
        }
    });
    document.getElementById('metricsSidebarList').addEventListener('click', function(e) {
        const metricsButton = e.target.closest('.filter-btn'); 
        if (metricsButton) {
            const name = metricsButton.dataset.designer;
            if (name) generateDesignerMetrics(name);
        }
    });
    document.getElementById('childOrdersList').addEventListener('click', function(e) {
            const deleteButton = e.target.closest('.btn-delete-child');
            if(deleteButton) {
            e.stopPropagation(); 
            const childId = deleteButton.dataset.childId;
            const childCode = deleteButton.dataset.childCode;
            if (childId && childCode) deleteChildOrder(childId, childCode);
            }
    });
    document.getElementById('view-workPlanContent').addEventListener('click', function(e) {
            const removeButton = e.target.closest('.btn-remove-from-plan');
            if(removeButton) {
            e.stopPropagation();
            const planEntryId = removeButton.dataset.planEntryId;
            const orderCode = removeButton.dataset.orderCode;
            if (planEntryId) removeOrderFromPlan(planEntryId, orderCode);
            }
    });

    // Teclado (Accesibilidad)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(); closeMultiModal(); closeWeeklyReportModal();
            hideWorkPlanView(); closeDesignerManager(); hideMetricsView(); 
            hideDepartmentMetrics(); closeConfirmModal(); closeCompareModals(); 
        }
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            const assignModal = document.getElementById('assignModal');
            if (assignModal.classList.contains('active')) saveAssignment();
        }
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            if (document.getElementById('dashboard').style.display === 'block') {
                document.getElementById('searchInput').focus();
            }
        }
        // Navegación con flechas si no hay inputs activos
        const targetNode = e.target.nodeName.toLowerCase();
        if (targetNode !== 'input' && targetNode !== 'textarea' && targetNode !== 'select') {
            if (document.getElementById('dashboard').style.display === 'block') {
                if (e.key === 'ArrowLeft') { e.preventDefault(); changePage(currentPage - 1); }
                if (e.key === 'ArrowRight') { e.preventDefault(); changePage(currentPage + 1); }
            }
        }
    });
});

// ======================================================
// ===== CORE FIREBASE & SINCRONIZACIÓN =====
// ======================================================

function iniciarLoginConGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch((error) => {
        console.error("Error Auth:", error);
        showCustomAlert(`Error de autenticación: ${error.message}`, 'error');
    });
}

function iniciarLogout() {
    firebase.auth().signOut();
}

function conectarDatosDeFirebase() {
    if (!usuarioActual) return;
    
    const dbStatus = document.getElementById('dbStatus');
    dbStatus.textContent = '● Conectando...';
    dbStatus.className = "ml-3 font-medium text-yellow-600";
    
    // 1. Asignaciones
    db_firestore.collection('assignments').onSnapshot((snapshot) => {
        firebaseAssignmentsMap.clear();
        snapshot.forEach((doc) => { firebaseAssignmentsMap.set(doc.id, doc.data()); });
        console.log(`Sync: ${firebaseAssignmentsMap.size} asignaciones.`);
        if(isExcelLoaded) mergeYActualizar();
        
        dbStatus.textContent = '● En Línea';
        dbStatus.className = "ml-3 font-medium text-green-600";
    }, (err) => {
        console.error(err);
        dbStatus.textContent = '● Error Conexión';
        dbStatus.className = "ml-3 font-medium text-red-600";
    });

    // 2. Historial
    db_firestore.collection('history').onSnapshot((snapshot) => {
        firebaseHistoryMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!firebaseHistoryMap.has(data.orderId)) firebaseHistoryMap.set(data.orderId, []);
            firebaseHistoryMap.get(data.orderId).push(data);
        });
    });

    // 3. Hijas
    db_firestore.collection('childOrders').onSnapshot((snapshot) => {
        firebaseChildOrdersMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!firebaseChildOrdersMap.has(data.parentOrderId)) firebaseChildOrdersMap.set(data.parentOrderId, []);
            firebaseChildOrdersMap.get(data.parentOrderId).push(data);
        });
        needsRecalculation = true;
        if(isExcelLoaded) mergeYActualizar();
    });
    
    // 4. Diseñadores
    db_firestore.collection('designers').orderBy('name').onSnapshot((snapshot) => {
        firebaseDesignersMap.clear();
        let newDesignerList = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            firebaseDesignersMap.set(doc.id, data);
            newDesignerList.push(data.name);
        });
        designerList = newDesignerList;
        updateAllDesignerDropdowns();
        populateDesignerManagerModal();
        if(isExcelLoaded) generateWorkloadReport();
    });

    // 5. Plan Semanal
    db_firestore.collection('weeklyPlan').onSnapshot((snapshot) => {
        firebaseWeeklyPlanMap.clear();
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!firebaseWeeklyPlanMap.has(data.weekIdentifier)) firebaseWeeklyPlanMap.set(data.weekIdentifier, []);
            firebaseWeeklyPlanMap.get(data.weekIdentifier).push(data);
        });
        if (document.getElementById('workPlanView').style.display === 'block') generateWorkPlan();
    });
}

function mergeYActualizar() {
    if (!isExcelLoaded) return;
    console.log("Fusionando datos...");
    recalculateChildPieces(); 

    for (let i = 0; i < allOrders.length; i++) {
        const order = allOrders[i];
        const fbData = firebaseAssignmentsMap.get(order.orderId);
        
        if (fbData) {
            order.designer = fbData.designer || '';
            order.customStatus = fbData.customStatus || '';
            order.receivedDate = fbData.receivedDate || '';
            order.notes = fbData.notes || '';
            order.completedDate = fbData.completedDate || null;
        } else {
            order.designer = '';
            order.customStatus = '';
            order.receivedDate = '';
            order.notes = '';
            order.completedDate = null;
        }

        // Auto-completado si sale de producción a otro depto
        if (fbData && 
            ['Bandeja','Producción','Auditoría'].includes(fbData.customStatus) &&
            order.departamento !== 'P_Art' && order.departamento !== 'Sin Departamento') 
        {
            const newCompletedDate = new Date().toISOString();
            order.customStatus = 'Completada';
            order.completedDate = newCompletedDate;
            saveAssignmentToDB_Firestore(order.orderId, 
                { customStatus: 'Completada', completedDate: newCompletedDate }, 
                [`Auto: ${fbData.customStatus} → Completada (movido a ${order.departamento})`]
            );
        }
    }
    updateDashboard();
}

// ======================================================
// ===== FUNCIONES CRUD (DB) =====
// ======================================================

async function saveAssignmentToDB_Firestore(orderId, dataToSave, historyChanges = []) {
    if (!usuarioActual) throw new Error("No estás autenticado.");
    const batch = db_firestore.batch();
    
    // Guardar asignación
    dataToSave.lastModified = new Date().toISOString();
    if (dataToSave.designer === undefined) dataToSave.designer = '';
    const assignmentRef = db_firestore.collection('assignments').doc(orderId);
    batch.set(assignmentRef, dataToSave, { merge: true });

    // Guardar historial
    if (historyChanges.length > 0) {
        const user = usuarioActual.displayName || usuarioActual.email;
        historyChanges.forEach(change => {
            const historyRef = db_firestore.collection('history').doc();
            batch.set(historyRef, {
                orderId, change, user, timestamp: new Date().toISOString()
            });
        });
    }
    return await batch.commit();
}

/**
 * (MEJORADO) Guarda múltiples asignaciones dividiendo en lotes (chunks)
 */
async function saveMultiAssignment() {
    if (selectedOrders.size === 0) return;
    
    try {
        const newDesigner = document.getElementById('multiModalDesigner').value;
        const newStatus = document.getElementById('multiModalStatus').value;
        const newReceivedDate = document.getElementById('multiModalReceivedDate').value;
        const newNotes = document.getElementById('multiModalNotes').value;
        
        let changesCount = 0;
        const user = usuarioActual.displayName || usuarioActual.email;

        const BATCH_LIMIT = 450; 
        let currentBatch = db_firestore.batch();
        let operationCount = 0;
        const commitPromises = []; 
        
        for (const orderId of selectedOrders) {
            const order = allOrders.find(o => o.orderId === orderId);
            if (!order || order.departamento !== 'P_Art') continue; 
            
            const oldAssignment = firebaseAssignmentsMap.get(orderId) || {};
            const changes = [];
            let dataToSave = {};

            if (newDesigner && oldAssignment.designer !== newDesigner) {
                changes.push(`Diseñador: ${oldAssignment.designer || '-'} → ${newDesigner}`);
                dataToSave.designer = newDesigner;
            }
            if (newStatus && oldAssignment.customStatus !== newStatus) {
                changes.push(`Estado: ${oldAssignment.customStatus || '-'} → ${newStatus}`);
                dataToSave.customStatus = newStatus;
                if (newStatus === 'Completada' && oldAssignment.customStatus !== 'Completada') {
                    dataToSave.completedDate = new Date().toISOString();
                    changes.push(`Completada el: ${new Date().toLocaleDateString('es-ES')}`);
                } else if (newStatus !== 'Completada') {
                    dataToSave.completedDate = null; 
                }
            }
            if (newReceivedDate && oldAssignment.receivedDate !== newReceivedDate) {
                const formattedDate = new Date(newReceivedDate + 'T00:00:00Z').toLocaleDateString('es-ES');
                changes.push(`Fecha Recibida: ${formattedDate}`);
                dataToSave.receivedDate = newReceivedDate;
            }
            if (newNotes && oldAssignment.notes !== newNotes) {
                changes.push(`Nota actualizada: "${newNotes}"`);
                dataToSave.notes = newNotes;
            }
            
            if (changes.length > 0) {
                dataToSave.lastModified = new Date().toISOString();
                
                // Op 1: Update Assignment
                const assignmentRef = db_firestore.collection('assignments').doc(orderId);
                currentBatch.set(assignmentRef, dataToSave, { merge: true });
                operationCount++;
                
                // Op 2: Create History
                const historyRef = db_firestore.collection('history').doc();
                currentBatch.set(historyRef, {
                    orderId: orderId,
                    change: `Asignación múltiple: ${changes.join(', ')}`,
                    user: user,
                    timestamp: new Date().toISOString()
                });
                operationCount++;
                
                changesCount++;

                if (operationCount >= BATCH_LIMIT) {
                    commitPromises.push(currentBatch.commit());
                    currentBatch = db_firestore.batch();
                    operationCount = 0;
                }
            }
        }
        
        if (operationCount > 0) commitPromises.push(currentBatch.commit());
        
        showLoading('Guardando cambios masivos...');
        await Promise.all(commitPromises);
        hideLoading();
        
        closeMultiModal();
        clearSelection();
        showCustomAlert(`Se han actualizado ${changesCount} órdenes.`, 'success');

    } catch (error) {
        console.error('Error saveMultiAssignment:', error);
        hideLoading();
        showCustomAlert(`Error: ${error.message}`, 'error');
    }
}

async function saveChildOrderToDB(childOrder) {
    return await db_firestore.collection('childOrders').doc(childOrder.childOrderId).set(childOrder);
}

async function deleteChildOrderFromDB(childOrderId) {
    return await db_firestore.collection('childOrders').doc(childOrderId).delete();
}

async function addDesigner() {
    const input = document.getElementById('newDesignerName');
    const name = input.value.trim();
    if (!name) return;
    if (designerList.map(d => d.toLowerCase()).includes(name.toLowerCase())) {
        showCustomAlert(`El diseñador "${name}" ya existe.`, 'error');
        return;
    }
    try {
        await db_firestore.collection('designers').add({ name: name });
        input.value = '';
        showCustomAlert(`Diseñador "${name}" agregado.`, 'success');
    } catch (error) {
        showCustomAlert(`Error: ${error.message}`, 'error');
    }
}

/**
 * (MEJORADO) Elimina diseñador y desasigna órdenes en lotes seguros.
 */
async function deleteDesigner(docId, name) {
    const assignedOrders = allOrders.filter(o => o.designer === name && o.departamento === 'P_Art');
    let message = `¿Estás seguro de eliminar a "${name}"?`;
    if (assignedOrders.length > 0) {
        message = `⚠️ ADVERTENCIA: "${name}" tiene ${assignedOrders.length} órdenes activas. Se desasignarán. ¿Continuar?`;
    }

    showConfirmModal(message, async () => {
        try {
            showLoading(`Eliminando a ${name}...`);

            await db_firestore.collection('designers').doc(docId).delete();
            
            const BATCH_LIMIT = 450;
            let currentBatch = db_firestore.batch();
            let operationCount = 0;
            const commitPromises = [];
            let ordersUpdated = 0;

            for (const [orderId, data] of firebaseAssignmentsMap.entries()) {
                if (data.designer === name) {
                    const docRef = db_firestore.collection('assignments').doc(orderId);
                    currentBatch.update(docRef, { designer: '' });
                    operationCount++;
                    ordersUpdated++;

                    if (operationCount >= BATCH_LIMIT) {
                        commitPromises.push(currentBatch.commit());
                        currentBatch = db_firestore.batch();
                        operationCount = 0;
                    }
                }
            }
            if (operationCount > 0) commitPromises.push(currentBatch.commit());

            await Promise.all(commitPromises);
            hideLoading();
            showCustomAlert(`Eliminado. ${ordersUpdated} órdenes desasignadas.`, 'success');
        } catch (error) {
            hideLoading();
            showCustomAlert(`Error: ${error.message}`, 'error');
        }
    });
}

async function addOrderToWorkPlanDB(order, weekIdentifier) {
    const planEntryId = `${order.orderId}_${weekIdentifier}`;
    const planRef = db_firestore.collection('weeklyPlan').doc(planEntryId);
    const doc = await planRef.get();
    if (doc.exists) return false;

    const planEntry = {
        planEntryId, orderId: order.orderId, weekIdentifier,
        designer: order.designer, planStatus: 'Pendiente', addedAt: new Date().toISOString(),
        cliente: order.cliente, codigoContrato: order.codigoContrato, estilo: order.estilo,
        fechaDespacho: order.fechaDespacho, cantidad: order.cantidad, childPieces: order.childPieces,
        isLate: order.isLate, isAboutToExpire: order.isAboutToExpire
    };
    await planRef.set(planEntry);
    return true;
}

async function getWorkPlanForWeek(weekIdentifier) {
    return firebaseWeeklyPlanMap.get(weekIdentifier) || [];
}

async function removeOrderFromWorkPlanDB(planEntryId) {
    return await db_firestore.collection('weeklyPlan').doc(planEntryId).delete();
}

// ======================================================
// ===== UTILIDADES =====
// ======================================================

function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }

function escapeHTML(str) {
    if (str === null || typeof str === 'undefined') return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showCustomAlert(message, type = 'info') {
    const alertDiv = document.getElementById('customAlert');
    let alertClass = 'bg-blue-100 border-blue-500 text-blue-800';
    if (type === 'error') alertClass = 'bg-red-100 border-red-500 text-red-800';
    if (type === 'success') alertClass = 'bg-green-100 border-green-500 text-green-800';
    
    alertDiv.className = `p-4 mb-4 rounded-lg border-l-4 ${alertClass}`;
    alertDiv.innerHTML = `<strong class="font-semibold">${escapeHTML(message)}</strong>`;
    alertDiv.style.display = 'block';
    setTimeout(() => { alertDiv.style.display = 'none'; }, type === 'error' ? 10000 : 5000);
}

let confirmCallback = null;
function showConfirmModal(message, onConfirmCallback) {
    document.getElementById('confirmModalMessage').textContent = message;
    confirmCallback = onConfirmCallback;
    document.getElementById('confirmModal').classList.add('active');
    document.body.classList.add('modal-open');
    const confirmBtn = document.getElementById('confirmModalConfirm');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    newConfirmBtn.addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        closeConfirmModal();
    }, { once: true });
}
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    document.body.classList.remove('modal-open');
    confirmCallback = null;
}

function showLoading(message = 'Cargando...') {
    if (document.getElementById('loadingOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.className = 'loading-overlay'; 
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHTML(message)}</p>`;
    document.body.appendChild(overlay);
}
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.remove();
}

function debounce(func, delay) {
    let debounceTimer;
    return function() {
        const context = this; const args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(context, args), delay);
    }
}

// ======================================================
// ===== EXCEL & PARSER =====
// ======================================================

function handleDrop(e){ handleFiles(e.dataTransfer.files); }
function handleFileSelect(e){ handleFiles(e.target.files); }
function handleFiles(files){
    if (!files || files.length === 0) return;
    document.getElementById('fileName').textContent = files[0].name;
    processFile(files[0]);
}

async function processFile(file) {
    showLoading('Procesando Excel...');
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames.find(n => /working\s*pro[c]{1,2}ess\s*all/i.test(n));

        if (!sheetName) {
            showCustomAlert('No se encontró "Working Process All".', 'error');
            hideLoading(); return;
        }
        
        const arr = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
        let headerIndex = -1;
        for (let i = 0; i < Math.min(arr.length, 12); i++) {
            const row = arr[i].map(c => String(c).toLowerCase());
            if (row.some(c => c.includes('fecha')) && row.some(c => c.includes('cliente'))) {
                headerIndex = i; break;
            }
        }
        if (headerIndex === -1) {
             showCustomAlert('Error: No se detectaron encabezados.', 'error');
            hideLoading(); return;
        }
        
        const headers = arr[headerIndex].map(h => String(h).trim().replace(/,/g, '').toLowerCase());
        const rows = arr.slice(headerIndex + 1);
        const colIndices = {
            fecha: headers.findIndex(h => h.includes('fecha')),
            cliente: headers.findIndex(h => h.includes('cliente')),
            codigo: headers.findIndex(h => h.includes('codigo') || h.includes('contrato')),
            estilo: headers.findIndex(h => h.includes('estilo')),
            team: headers.findIndex(h => h.includes('team')),
        };

        const departmentPatterns = [
            { pattern: /p[_\s]*order[_\s]*entry/i, name: 'P_Order_Entry' },
            { pattern: /p[_\s]*art/i, name: 'P_Art' },
            { pattern: /p[_\s]*printing/i, name: 'P_Printing' },
            { pattern: /p[_\s]*press/i, name: 'P_Press' },
            { pattern: /p[_\s]*cut/i, name: 'P_Cut' },
            { pattern: /p[_\s]*r[_\s]*to[_\s]*sew/i, name: 'P_R_to_Sew' },
            { pattern: /p[_\s]*sew/i, name: 'P_Sew' },
            { pattern: /sum[_\s]*of[_\s]*twill/i, name: 'Sum of TWILL' },
            { pattern: /p[_\s]*packing/i, name: 'P_Packing' },
            { pattern: /p[_\s]*shipping/i, name: 'P_Shipping' }
        ];
        const departmentIndices = [];
        headers.forEach((header, index) => {
            const matched = departmentPatterns.find(dept => dept.pattern.test(header));
            if (matched) departmentIndices.push({ index: index, name: matched.name });
        });
        
        let processedOrders = [];
        let currentDate = null, currentClient = "", currentContrato = "", currentStyle = "", currentTeam = "";
        
        for (const row of rows) {
            if (!row || row.length === 0 || row.every(c => c === "" || c === null)) continue;
            const lowerRow = row.slice(0, 4).map(c => String(c).toLowerCase());
            if (lowerRow.some(c => c.includes('total') || c.includes('subtotal') || c.includes('grand'))) continue;

            if (colIndices.fecha >= 0 && row[colIndices.fecha]) {
                const rawFecha = row[colIndices.fecha];
                let deliveryDate = typeof rawFecha === 'number' ? new Date((rawFecha - 25569) * 86400 * 1000) : new Date(rawFecha);
                if (!isNaN(deliveryDate)) currentDate = new Date(Date.UTC(deliveryDate.getFullYear(), deliveryDate.getMonth(), deliveryDate.getDate()));
            }
            if (colIndices.cliente >= 0 && row[colIndices.cliente]) currentClient = String(row[colIndices.cliente]).trim();
            if (colIndices.codigo >= 0 && row[colIndices.codigo]) currentContrato = String(row[colIndices.codigo]).trim();
            if (colIndices.estilo >= 0 && row[colIndices.estilo]) currentStyle = String(row[colIndices.estilo]).trim();
            if (colIndices.team >= 0 && row[colIndices.team]) currentTeam = String(row[colIndices.team]).trim();

            if (!currentClient || !currentContrato) continue;

            let orderCantidad = 0;
            let orderDepartamento = "Sin Departamento";
            for (let i = departmentIndices.length - 1; i >= 0; i--) {
                const col = departmentIndices[i];
                const rawValue = row[col.index];
                if (rawValue) {
                    const n = Number(String(rawValue).replace(/,|\s/g, ''));
                    if (!isNaN(n) && n > 0) {
                        orderCantidad = n;
                        orderDepartamento = col.name;
                        break; 
                    }
                }
            }
            if (orderCantidad <= 0) { orderCantidad = 0; orderDepartamento = "Sin Departamento"; }

            const fechaDespacho = currentDate ? new Date(currentDate) : null;
            const orderId = `${currentClient}_${currentContrato}_${fechaDespacho ? fechaDespacho.getTime() : 'nodate'}_${currentStyle}`;
            const today = new Date(); today.setHours(0,0,0,0);
            const isLate = fechaDespacho && fechaDespacho < today;
            let daysLate = 0;
            if (isLate) daysLate = Math.ceil((today.getTime() - fechaDespacho.getTime()) / (1000*60*60*24));
            
            const fbData = firebaseAssignmentsMap.get(orderId);
            let currentStatus = fbData ? fbData.customStatus : '';
            let currentCompletedDate = fbData ? fbData.completedDate : null;

            if (fbData && ['Bandeja','Producción','Auditoría'].includes(fbData.customStatus) &&
                orderDepartamento !== 'P_Art' && orderDepartamento !== 'Sin Departamento') {
                currentStatus = 'Completada';
                currentCompletedDate = new Date().toISOString();
                saveAssignmentToDB_Firestore(orderId, { customStatus: 'Completada', completedDate: currentCompletedDate }, 
                    [`Auto: ${fbData.customStatus} → Completada (movido a ${orderDepartamento})`]
                );
            }

            processedOrders.push({
                orderId, fechaDespacho, cliente: currentClient, codigoContrato: currentContrato,
                estilo: currentStyle, teamName: currentTeam, departamento: orderDepartamento,
                cantidad: orderCantidad, childPieces: 0, isLate, daysLate,
                isVeryLate: daysLate > 7,
                isAboutToExpire: fechaDespacho && !isLate && ((fechaDespacho.getTime() - today.getTime()) / (1000*60*60*24)) <= 2,
                designer: fbData ? fbData.designer : '',
                customStatus: currentStatus,
                receivedDate: fbData ? fbData.receivedDate : '',
                notes: fbData ? fbData.notes : '',
                completedDate: currentCompletedDate
            });
        }

        allOrders = processedOrders;
        isExcelLoaded = true;
        needsRecalculation = true; 
        recalculateChildPieces();
        await updateDashboard();
        generateSummary();
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';

    } catch (error) {
        showCustomAlert('Error procesando archivo: ' + error.message, 'error');
        console.error(error);
    } finally {
        hideLoading();
    }
}

// ======================================================
// ===== LÓGICA: ÓRDENES HIJAS =====
// ======================================================

async function recalculateChildPieces() {
    if (!needsRecalculation) return;
    let tempChildPiecesCache = new Map();
    firebaseChildOrdersMap.forEach((childList, parentId) => {
        const totalPieces = childList.reduce((sum, child) => sum + (child.cantidad || 0), 0);
        tempChildPiecesCache.set(parentId, totalPieces);
    });
    for (const order of allOrders) {
        order.childPieces = tempChildPiecesCache.get(order.orderId) || 0;
    }
    needsRecalculation = false;
}

async function saveChildOrder() {
    try {
        if (!currentEditingOrderId) return;
        const childNumber = document.getElementById('childOrderNumber').value;
        const childPieces = parseInt(document.getElementById('childPieces').value);
        const childDeliveryDate = document.getElementById('childDeliveryDate').value;
        const childNotes = document.getElementById('childNotes').value;
        
        if (!childNumber || !childPieces) { showCustomAlert('Faltan datos.', 'error'); return; }
        
        const parentOrder = allOrders.find(o => o.orderId === currentEditingOrderId);
        if (!parentOrder) return;
        const childCode = `${parentOrder.codigoContrato}-${childNumber}`;
        const existingChildren = firebaseChildOrdersMap.get(parentOrder.orderId) || [];
        if (existingChildren.some(c => c.childCode === childCode)) { showCustomAlert('Ya existe este código.', 'error'); return; }
        
        const deliveryDate = childDeliveryDate ? new Date(childDeliveryDate + 'T00:00:00Z') : (parentOrder.fechaDespacho || new Date());
        const childOrder = {
            childOrderId: `${parentOrder.orderId}_child_${Date.now()}`,
            parentOrderId: parentOrder.orderId, childCode, cliente: parentOrder.cliente,
            estilo: parentOrder.estilo, teamName: parentOrder.teamName, designer: parentOrder.designer,
            customStatus: parentOrder.customStatus, fechaDespacho: deliveryDate, cantidad: childPieces,
            notes: childNotes, createdAt: new Date().toISOString()
        };
        
        await saveChildOrderToDB(childOrder);
        await saveAssignmentToDB_Firestore(parentOrder.orderId, {}, [`Hija creada: ${childCode}`]);
        closeAddChildModal();
        showCustomAlert(`Hija ${childCode} creada.`, 'success');
    } catch (error) {
        showCustomAlert(`Error: ${error.message}`, 'error');
    }
}

async function deleteChildOrder(childOrderId, childCode) {
    showConfirmModal(`¿Eliminar hija ${childCode}?`, async () => {
        try {
            await deleteChildOrderFromDB(childOrderId);
            await saveAssignmentToDB_Firestore(currentEditingOrderId, {}, [`Hija eliminada: ${childCode}`]);
        } catch (e) { showCustomAlert(e.message, 'error'); }
    });
}

async function loadChildOrders() {
    if (!currentEditingOrderId) return;
    const parentOrder = allOrders.find(o => o.orderId === currentEditingOrderId);
    const childOrders = firebaseChildOrdersMap.get(currentEditingOrderId) || [];
    document.getElementById('childOrderCount').textContent = childOrders.length;
    const list = document.getElementById('childOrdersList');
    
    if (childOrders.length === 0) { list.innerHTML = '<p class="text-gray-400 text-center text-sm">Sin hijas</p>'; return; }

    list.innerHTML = childOrders.map(child => {
        const dDate = child.fechaDespacho ? new Date(child.fechaDespacho) : null;
        const isLate = dDate && dDate < new Date().setHours(0,0,0,0);
        return `
            <div class="bg-white p-2 rounded border text-sm">
                <div class="flex justify-between">
                    <strong>${escapeHTML(child.childCode)}</strong>
                    <button class="btn-delete-child text-red-600 hover:text-red-800" data-child-id="${child.childOrderId}" data-child-code="${child.childCode}">Trash</button>
                </div>
                <div class="text-xs text-gray-500">
                    ${child.cantidad} pzs | ${dDate ? formatDate(dDate) : '-'} 
                    ${isLate ? '<span class="text-red-600 font-bold">!</span>' : ''}
                </div>
                ${child.notes ? `<div class="text-xs italic text-gray-400">${escapeHTML(child.notes)}</div>` : ''}
            </div>
        `;
    }).join('');
}

function openAddChildModal() {
    if (!currentEditingOrderId) return;
    const p = allOrders.find(o => o.orderId === currentEditingOrderId);
    document.getElementById('parentOrderInfo').textContent = `${p.codigoContrato} - ${p.cliente}`;
    ['childOrderNumber','childOrderCode','childPieces','childDeliveryDate','childNotes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('addChildModal').classList.add('active');
    document.body.classList.add('modal-open');
}
function closeAddChildModal() { document.getElementById('addChildModal').classList.remove('active'); }
function updateChildOrderCode() {
    const p = allOrders.find(o => o.orderId === currentEditingOrderId);
    const n = document.getElementById('childOrderNumber').value;
    if(p && n) document.getElementById('childOrderCode').value = `${p.codigoContrato}-${n}`;
}

// ======================================================
// ===== LÓGICA: MODALES & EDICIÓN =====
// ======================================================

window.openAssignModal = async function(orderId) {
    currentEditingOrderId = orderId;
    const order = allOrders.find(o => o.orderId === orderId);
    if (!order) return;
    
    ['cliente','codigo','estilo','departamento','fecha','piezas'].forEach(field => {
        const val = field==='fecha' ? formatDate(order.fechaDespacho) : field==='piezas' ? (order.cantidad).toLocaleString() : order[field==='codigo'?'codigoContrato':field] || '-';
        document.getElementById(`detail${field.charAt(0).toUpperCase()+field.slice(1)}`).textContent = val;
    });
    
    document.getElementById('modalDesigner').value = order.designer || '';
    document.getElementById('modalStatus').value = order.customStatus || '';
    document.getElementById('modalReceivedDate').value = order.receivedDate || '';
    document.getElementById('modalNotes').value = order.notes || '';
    
    const isPArt = order.departamento === 'P_Art';
    ['modalDesigner','modalStatus','modalReceivedDate','addChildOrderBtn'].forEach(id => document.getElementById(id).disabled = !isPArt);

    const history = firebaseHistoryMap.get(orderId) || [];
    document.getElementById('modalHistory').innerHTML = history.length ? history.sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).map(h => 
        `<div class="text-xs border-b py-1"><span class="text-gray-400">${new Date(h.timestamp).toLocaleDateString()}</span> <strong>${escapeHTML(h.user)}</strong>: ${escapeHTML(h.change)}</div>`
    ).join('') : '<span class="text-xs text-gray-400">Sin historial</span>';
    
    await loadChildOrders();
    document.getElementById('assignModal').classList.add('active');
    document.body.classList.add('modal-open');
}

window.closeModal = function() {
    document.getElementById('assignModal').classList.remove('active');
    document.body.classList.remove('modal-open');
    currentEditingOrderId = null;
}

async function asignarmeAmi() {
    if (!usuarioActual || !currentEditingOrderId) return;
    const name = usuarioActual.displayName;
    const order = allOrders.find(o => o.orderId === currentEditingOrderId);
    if (order.designer === name) return showCustomAlert('Ya es tuya.', 'info');
    
    try {
        await saveAssignmentToDB_Firestore(currentEditingOrderId, 
            { designer: name, customStatus: order.customStatus || 'Bandeja' }, 
            [`Diseñador: ${order.designer||'-'} → ${name}`]
        );
        closeModal(); showCustomAlert('Asignada.', 'success');
    } catch (e) { showCustomAlert(e.message, 'error'); }
}

window.saveAssignment = async function() {
    if (!currentEditingOrderId) return;
    const order = allOrders.find(o => o.orderId === currentEditingOrderId);
    const newD = document.getElementById('modalDesigner').value;
    const newS = document.getElementById('modalStatus').value;
    const newR = document.getElementById('modalReceivedDate').value;
    const newN = document.getElementById('modalNotes').value;
    
    let changes = [], data = {};
    if (order.designer !== newD) { changes.push(`Diseñador: ${newD}`); data.designer = newD; }
    if (order.customStatus !== newS) {
        changes.push(`Estado: ${newS}`); data.customStatus = newS;
        if (newS === 'Completada' && order.customStatus !== 'Completada') { data.completedDate = new Date().toISOString(); changes.push('Completada'); }
        else if (newS !== 'Completada') data.completedDate = null;
    }
    if (order.receivedDate !== newR) { changes.push(`Recibida: ${newR}`); data.receivedDate = newR; }
    if (order.notes !== newN) { changes.push('Nota editada'); data.notes = newN; }
    
    if (changes.length) {
        await saveAssignmentToDB_Firestore(currentEditingOrderId, data, changes);
        showCustomAlert('Guardado.', 'success');
    }
    closeModal();
}

// ======================================================
// ===== LÓGICA: UI PRINCIPAL =====
// ======================================================

function updateAllDesignerDropdowns() {
    const html = '<option value="">Todos</option>' + designerList.map(n => `<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
    const modalHtml = '<option value="">Sin asignar</option>' + designerList.map(n => `<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
    document.getElementById('designerFilter').innerHTML = html;
    document.getElementById('designerFilter').value = currentDesignerFilter;
    ['modalDesigner','multiModalDesigner'].forEach(id => document.getElementById(id).innerHTML = modalHtml);
}

function toggleOrderSelection(id) {
    selectedOrders.has(id) ? selectedOrders.delete(id) : selectedOrders.add(id);
    updateMultiSelectBar(); updateCheckboxes();
}
function toggleSelectAll() {
    const chk = document.getElementById('selectAll');
    paginatedOrders.filter(o=>o.departamento==='P_Art').forEach(o => chk.checked ? selectedOrders.add(o.orderId) : selectedOrders.delete(o.orderId));
    updateMultiSelectBar(); updateCheckboxes();
}
function clearSelection() { selectedOrders.clear(); updateMultiSelectBar(); updateCheckboxes(); }
function updateMultiSelectBar() {
    const bar = document.getElementById('multiSelectBar');
    document.getElementById('selectedCount').textContent = selectedOrders.size;
    selectedOrders.size > 0 ? bar.classList.add('active') : bar.classList.remove('active');
}
function updateCheckboxes() {
    document.querySelectorAll('tbody input[type="checkbox"]').forEach(c => c.checked = selectedOrders.has(c.dataset.orderId));
    const onPage = paginatedOrders.filter(o=>o.departamento==='P_Art');
    document.getElementById('selectAll').checked = onPage.length > 0 && onPage.every(o => selectedOrders.has(o.orderId));
}

function openMultiAssignModal() {
    if (!selectedOrders.size) return;
    let allPArt = true;
    let html = '';
    selectedOrders.forEach(id => {
        const o = allOrders.find(x => x.orderId === id);
        if(o) {
            if(o.departamento !== 'P_Art') allPArt = false;
            html += `<div class="text-xs border-b py-1"><strong>${o.codigoContrato}</strong> - ${o.cliente}</div>`;
        }
    });
    if(!allPArt) { showCustomAlert('Solo P_Art.', 'error'); clearSelection(); return; }
    document.getElementById('selectedOrdersList').innerHTML = html;
    ['multiModalDesigner','multiModalStatus','multiModalReceivedDate','multiModalNotes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('multiAssignModal').classList.add('active');
}
function closeMultiModal() { document.getElementById('multiAssignModal').classList.remove('active'); }

function populateDesignerManagerModal() {
    const list = document.getElementById('designerManagerList');
    list.innerHTML = firebaseDesignersMap.size ? '' : '<p class="text-gray-400 text-center">Vacío</p>';
    firebaseDesignersMap.forEach((d, id) => {
        list.innerHTML += `<div class="flex justify-between p-2 border-b bg-white"><span>${escapeHTML(d.name)}</span><button class="btn-delete-designer text-red-600 text-xs" data-name="${d.name}" data-id="${id}">Borrar</button></div>`;
    });
}
function openDesignerManager() { populateDesignerManagerModal(); document.getElementById('designerManagerModal').classList.add('active'); }
function closeDesignerManager() { document.getElementById('designerManagerModal').classList.remove('active'); }

async function addSelectedToWorkPlan() {
    if (!selectedOrders.size) return;
    const week = getWeekIdentifier(new Date());
    let added = 0;
    for (const id of selectedOrders) {
        const o = allOrders.find(x => x.orderId === id);
        if (o && o.departamento === 'P_Art' && o.designer && await addOrderToWorkPlanDB(o, week)) added++;
    }
    showCustomAlert(`Agregadas ${added} al plan ${week}.`, 'success');
    clearSelection();
}

// --- Paginación y Tabla ---
function setupPagination(list) {
    const total = Math.ceil(list.length / rowsPerPage);
    if (currentPage > total) currentPage = total || 1;
    const start = (currentPage - 1) * rowsPerPage;
    paginatedOrders = list.slice(start, start + rowsPerPage);
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = total || 1;
    
    let html = `<button onclick="changePage(${currentPage-1})" ${currentPage===1?'disabled':''}>&lt;</button>`;
    html += `<span class="mx-2 text-sm">Página ${currentPage}</span>`;
    html += `<button onclick="changePage(${currentPage+1})" ${currentPage>=total?'disabled':''}>&gt;</button>`;
    document.getElementById('paginationControls').innerHTML = html;
}
function changePage(p) { currentPage = p; updateTable(); }
function changeRowsPerPage() { rowsPerPage = parseInt(document.getElementById('rowsPerPage').value); currentPage = 1; updateTable(); }

function getStatusBadge(o) {
    if (o.isVeryLate) return '<span class="bg-red-100 text-red-800 px-2 rounded text-xs">Muy Atrasada</span>';
    if (o.isLate) return '<span class="bg-red-100 text-red-800 px-2 rounded text-xs">Atrasada</span>';
    if (o.isAboutToExpire) return '<span class="bg-yellow-100 text-yellow-800 px-2 rounded text-xs">Por Vencer</span>';
    return '<span class="bg-green-100 text-green-800 px-2 rounded text-xs">A Tiempo</span>';
}

function getCustomStatusBadge(s) {
    const c = s==='Completada'?'gray': s==='Bandeja'?'yellow': s==='Producción'?'purple': s==='Auditoría'?'blue':'gray';
    return `<span class="bg-${c}-100 text-${c}-800 px-2 rounded text-xs">${s||'-'}</span>`;
}

function formatDate(d) { return d ? d.toLocaleDateString('es-ES', {timeZone:'UTC'}) : '-'; }
function getWeekIdentifier(d) {
    const date = new Date(d.getTime()); date.setHours(0,0,0,0); date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return `${date.getFullYear()}-W${(1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)).toString().padStart(2,'0')}`;
}

async function updateTable() {
    // Filtros
    let res = allOrders.filter(o => {
        if(currentSearch) {
            const s = currentSearch.toLowerCase();
            if(!Object.values(o).some(v => String(v).toLowerCase().includes(s))) return false;
        }
        if(currentClientFilter && o.cliente !== currentClientFilter) return false;
        if(currentStyleFilter && o.estilo !== currentStyleFilter) return false;
        if(currentTeamFilter && o.teamName !== currentTeamFilter) return false;
        if(currentDepartamentoFilter && o.departamento !== currentDepartamentoFilter) return false;
        if(currentDesignerFilter && o.designer !== currentDesignerFilter) return false;
        if(currentCustomStatusFilter && o.customStatus !== currentCustomStatusFilter) return false;
        if(currentDateFrom && (!o.fechaDespacho || o.fechaDespacho < new Date(currentDateFrom))) return false;
        if(currentDateTo && (!o.fechaDespacho || o.fechaDespacho > new Date(currentDateTo+'T23:59:59'))) return false;
        
        if(currentFilter === 'late' && !o.isLate) return false;
        if(currentFilter === 'veryLate' && !o.isVeryLate) return false;
        if(currentFilter === 'aboutToExpire' && !o.isAboutToExpire) return false;
        
        return true;
    });

    // Ordenar
    res.sort((a,b) => {
        let valA = a[sortConfig.key], valB = b[sortConfig.key];
        if(sortConfig.key==='date') { valA = a.fechaDespacho||0; valB = b.fechaDespacho||0; }
        return (valA < valB ? -1 : 1) * (sortConfig.direction==='asc'?1:-1);
    });

    // Actualizar Stats
    document.getElementById('resultCount').textContent = res.length;
    document.getElementById('totalCount').textContent = allOrders.length;
    document.getElementById('resultPieces').textContent = res.reduce((s,o)=>s+(o.cantidad||0)+(o.childPieces||0),0).toLocaleString();

    setupPagination(res);
    
    const tbody = document.getElementById('tableBody');
    if (!paginatedOrders.length) { tbody.innerHTML = '<tr><td colspan="14" class="text-center py-4">Sin datos</td></tr>'; return; }
    
    tbody.innerHTML = paginatedOrders.map(o => `
        <tr class="hover:bg-gray-50 cursor-pointer ${o.isVeryLate?'bg-red-50':''}" onclick="openAssignModal('${o.orderId}')">
            <td class="px-6 py-4" onclick="event.stopPropagation()">${o.departamento==='P_Art'?`<input type="checkbox" data-order-id="${o.orderId}" onchange="toggleOrderSelection('${o.orderId}')">`:''}</td>
            <td class="px-6 py-4">${getStatusBadge(o)}</td>
            <td class="px-6 py-4 text-sm">${formatDate(o.fechaDespacho)}</td>
            <td class="px-6 py-4 text-sm font-bold">${escapeHTML(o.cliente)}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${escapeHTML(o.codigoContrato)} ${o.childPieces?'<span class="text-blue-500 text-xs">✚</span>':''}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${escapeHTML(o.estilo)}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${escapeHTML(o.teamName)}</td>
            <td class="px-6 py-4 text-xs"><span class="bg-gray-100 px-2 rounded">${escapeHTML(o.departamento)}</span></td>
            <td class="px-6 py-4 text-xs font-medium text-blue-600">${escapeHTML(o.designer)||'-'}</td>
            <td class="px-6 py-4">${getCustomStatusBadge(o.customStatus)}</td>
            <td class="px-6 py-4 text-sm text-gray-500">${o.receivedDate?new Date(o.receivedDate).toLocaleDateString():'-'}</td>
            <td class="px-6 py-4 text-sm font-bold text-blue-600">${o.cantidad.toLocaleString()}</td>
            <td class="px-6 py-4 text-sm">${o.notes?'📝':''}</td>
            <td class="px-6 py-4"><button class="text-blue-600 hover:underline text-xs" onclick="openAssignModal('${o.orderId}')">Ver</button></td>
        </tr>
    `).join('');
    updateCheckboxes();
}

function sortTable(key) {
    sortConfig.direction = (sortConfig.key === key && sortConfig.direction === 'asc') ? 'desc' : 'asc';
    sortConfig.key = key;
    updateTable();
}
function clearAllFilters() {
    currentSearch = ''; currentClientFilter = ''; currentStyleFilter = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('clientFilter').value = '';
    // ... reset other inputs ...
    updateTable();
}

// ======================================================
// ===== DASHBOARD & STATS =====
// ======================================================

async function updateDashboard() {
    if (!isExcelLoaded) return;
    if (needsRecalculation) recalculateChildPieces();
    
    const pArt = allOrders.filter(o => o.departamento === 'P_Art');
    const stats = {
        total: pArt.length,
        late: pArt.filter(o => o.isLate).length,
        veryLate: pArt.filter(o => o.isVeryLate).length,
        expiring: pArt.filter(o => o.isAboutToExpire).length,
        onTime: pArt.filter(o => !o.isLate && !o.isAboutToExpire).length,
        week: pArt.filter(o => o.fechaDespacho && o.fechaDespacho >= new Date() && o.fechaDespacho <= new Date(new Date().setDate(new Date().getDate()+7))).length,
        pieces: pArt.reduce((s,o) => s + o.cantidad + o.childPieces, 0)
    };
    
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statTotalPieces').textContent = stats.pieces.toLocaleString();
    document.getElementById('statLate').textContent = stats.late;
    document.getElementById('statExpiring').textContent = stats.expiring;
    document.getElementById('statOnTime').textContent = stats.onTime;
    document.getElementById('statThisWeek').textContent = stats.week;
    
    generateReports();
    populateFilterDropdowns();
    updateTable();
    updateAllDesignerDropdowns();
}

function populateFilterDropdowns() {
    const fill = (id, list) => {
        const sel = document.getElementById(id);
        const val = sel.value;
        sel.innerHTML = '<option value="">Todos</option>' + [...new Set(list)].sort().map(x => `<option value="${x}">${x}</option>`).join('');
        sel.value = val;
    };
    fill('clientFilter', allOrders.map(o=>o.cliente));
    fill('styleFilter', allOrders.map(o=>o.estilo));
    fill('teamFilter', allOrders.map(o=>o.teamName));
    fill('departamentoFilter', allOrders.map(o=>o.departamento));
    fill('customStatusFilter', CUSTOM_STATUS_OPTIONS);
}

function generateReports() {
    // Top Clientes
    const counts = {};
    allOrders.forEach(o => counts[o.cliente] = (counts[o.cliente]||0)+1);
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
    document.getElementById('clientReport').innerHTML = sorted.map(([k,v]) => 
        `<div class="flex justify-between text-sm border-b py-1"><span>${k}</span><b>${v}</b></div>`
    ).join('');
    generateWorkloadReport();
}

function generateWorkloadReport() {
    const stats = {};
    designerList.forEach(d => stats[d] = {count:0, pieces:0});
    let totalP = 0;
    allOrders.filter(o=>o.departamento==='P_Art'&&o.designer&&stats[o.designer]).forEach(o => {
        stats[o.designer].count++;
        const p = o.cantidad + o.childPieces;
        stats[o.designer].pieces += p;
        totalP += p;
    });
    document.getElementById('workloadTotal').textContent = totalP.toLocaleString() + ' pzs';
    document.getElementById('workloadList').innerHTML = designerList.map(d => {
        const s = stats[d];
        const pct = totalP ? ((s.pieces/totalP)*100).toFixed(1) : 0;
        return `
            <div class="mb-2">
                <div class="flex justify-between text-xs mb-1">
                    <strong>${d}</strong> <span>${s.count} ord | ${s.pieces} pzs | ${pct}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2"><div class="bg-blue-600 h-2 rounded-full" style="width: ${pct}%"></div></div>
            </div>
        `;
    }).join('');
}

// ======================================================
// ===== REPORTES & MÉTRICAS AVANZADAS =====
// ======================================================

function openWeeklyReportModal() {
    document.getElementById('weeklyReportModal').classList.add('active');
    document.getElementById('weekSelector').value = getWeekIdentifier(new Date());
    generateWeeklyReport();
}
function closeWeeklyReportModal() { document.getElementById('weeklyReportModal').classList.remove('active'); }

function generateWeeklyReport() {
    const val = document.getElementById('weekSelector').value;
    if (!val) return;
    const [y, w] = val.split('-W').map(Number);
    const d = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
    d.setUTCDate(d.getUTCDate() + 1 - (d.getUTCDay()||7));
    const start = new Date(d); const end = new Date(d); end.setUTCDate(end.getUTCDate()+6); end.setUTCHours(23,59,59);

    const res = allOrders.filter(o => {
        if(!o.receivedDate) return false;
        const r = new Date(o.receivedDate+'T00:00:00Z');
        return r >= start && r <= end;
    });

    document.getElementById('weeklyReportContent').innerHTML = `
        <h3 class="font-bold mb-2">Semana ${val} (${res.length} órdenes)</h3>
        <table class="w-full text-sm border">
            <thead class="bg-gray-100"><tr><th>Fecha</th><th>Cliente</th><th>Código</th><th>Piezas</th></tr></thead>
            <tbody>${res.map(o=>`<tr><td>${formatDate(new Date(o.receivedDate))}</td><td>${o.cliente}</td><td>${o.codigoContrato}</td><td>${o.cantidad}</td></tr>`).join('')}</tbody>
        </table>
    `;
}
function exportWeeklyReportAsPDF() {
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    doc.text(`Reporte ${document.getElementById('weekSelector').value}`, 10, 10);
    doc.autoTable({ html: '#weeklyReportContent table' });
    doc.save('reporte.pdf');
}

function showMetricsView() {
    document.getElementById('dashboard').style.display='none'; document.getElementById('designerMetricsView').style.display='block';
    document.getElementById('metricsSidebarList').innerHTML = designerList.map(d => 
        `<button class="filter-btn" onclick="generateDesignerMetrics('${d}')">${d}</button>`
    ).join('');
}
function hideMetricsView() { document.getElementById('designerMetricsView').style.display='none'; document.getElementById('dashboard').style.display='block'; }

function generateDesignerMetrics(name) {
    const orders = allOrders.filter(o => o.designer === name && o.departamento === 'P_Art');
    const completed = orders.filter(o => o.customStatus === 'Completada');
    const onTime = completed.filter(o => !o.isLate);
    const rate = completed.length ? ((onTime.length/completed.length)*100).toFixed(0) : 0;
    
    document.getElementById('metricsDetail').innerHTML = `
        <h2 class="text-2xl font-bold mb-4">${name}</h2>
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-white p-4 shadow rounded"><h3>Total Activas</h3><p class="text-2xl">${orders.length}</p></div>
            <div class="bg-white p-4 shadow rounded"><h3>Completadas</h3><p class="text-2xl">${completed.length}</p></div>
            <div class="bg-white p-4 shadow rounded"><h3>Cumplimiento</h3><p class="text-2xl text-${rate>80?'green':'red'}-600">${rate}%</p></div>
        </div>
        <canvas id="designerChart"></canvas>
    `;
    // Chart rendering would go here
}

function showDepartmentMetrics() {
    document.getElementById('dashboard').style.display='none'; document.getElementById('departmentMetricsView').style.display='block';
    // Calculation logic here
    document.getElementById('departmentMetricsContent').innerHTML = '<p>Métricas del departamento (Implementación pendiente de visuales)</p>';
}
function hideDepartmentMetrics() { document.getElementById('departmentMetricsView').style.display='none'; document.getElementById('dashboard').style.display='block'; }

function showWorkPlanView() {
    document.getElementById('dashboard').style.display='none'; document.getElementById('workPlanView').style.display='block';
    document.getElementById('view-workPlanWeekSelector').value = getWeekIdentifier(new Date());
    generateWorkPlan();
}
function hideWorkPlanView() { document.getElementById('workPlanView').style.display='none'; document.getElementById('dashboard').style.display='block'; }

async function generateWorkPlan() {
    const w = document.getElementById('view-workPlanWeekSelector').value;
    const plan = await getWorkPlanForWeek(w);
    document.getElementById('view-workPlanContent').innerHTML = plan.length 
        ? plan.map(p => `<div class="bg-gray-50 p-2 mb-1 border rounded flex justify-between"><span>${p.codigoContrato} - ${p.designer}</span><button class="btn-remove-from-plan text-red-500" data-plan-entry-id="${p.planEntryId}" data-order-code="${p.codigoContrato}">X</button></div>`).join('') 
        : '<p>Plan vacío</p>';
}

async function loadUrgentOrdersToPlan() {
    const w = document.getElementById('view-workPlanWeekSelector').value;
    const urgent = allOrders.filter(o => o.departamento==='P_Art' && (o.isLate||o.isAboutToExpire) && o.designer);
    for (const o of urgent) await addOrderToWorkPlanDB(o, w);
    generateWorkPlan();
}

// Reset
function resetApp() {
    showConfirmModal('¿Cargar nuevo Excel?', () => {
        isExcelLoaded = false; allOrders = []; document.getElementById('dashboard').style.display='none'; document.getElementById('uploadSection').style.display='block'; document.getElementById('fileInput').value='';
    });
}