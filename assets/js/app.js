// --- 1. LÓGICA DEL TEMA ---
const themeBtn = document.getElementById('themeToggleBtn');
const htmlElement = document.documentElement;
const THEME_KEY = 'miGestorTheme_v1';

const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
htmlElement.setAttribute('data-theme', savedTheme);
themeBtn.innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';

themeBtn.addEventListener('click', () => {
    let newTheme = htmlElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    themeBtn.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    htmlElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(THEME_KEY, newTheme); 
});

// --- 2. BASE DE DATOS LOCAL, FECHAS Y RESCATE MÁXIMO ---
const DB_KEY_DATA = 'miGestorFinancieroData_v23'; // Versión Segura
const DB_KEY_INCOME = 'miGestorIngreso_v2'; 
const DB_KEY_FIJOS = 'miGestorFijos_v2'; 
const DB_KEY_HISTORY = 'miGestorHistory_v2'; 

let ingresoSemanalBase = parseFloat(localStorage.getItem(DB_KEY_INCOME));
if(isNaN(ingresoSemanalBase)) ingresoSemanalBase = 1000.00; 

// Protección extrema para evitar que el reduce() falle
let gastosFijos = [];
try { gastosFijos = JSON.parse(localStorage.getItem(DB_KEY_FIJOS)) || []; } catch(e) {}
if (!Array.isArray(gastosFijos)) gastosFijos = [];

let historialData = [];
try { historialData = JSON.parse(localStorage.getItem(DB_KEY_HISTORY)) || []; } catch(e) {}
if (!Array.isArray(historialData)) historialData = [];

let financeData = [];
let activeTabState = {}; 
let editingCardIndex = null; 
let accordionState = {}; 
let activeTransactionMonth = 0; 
let currentTransactionType = 'gasto'; 
let isProcessing = false; 

// AJUSTES DE FACTURACIÓN
let diaCorte = parseInt(localStorage.getItem('miGestorCorte')) || 28;
let diaLimite = parseInt(localStorage.getItem('miGestorLimite')) || 8;

const nuSchedule = {
    '2026-03': 3583.50, '2026-04': 2967.29, '2026-05': 2967.28,
    '2026-06': 1101.00, '2026-07': 1101.00, '2026-08': 1101.00,
    '2026-09': 1066.00, '2026-10': 1066.00, '2026-11': 1066.00, '2026-12': 1066.00
};

function formatMoney(value) { return '$' + (value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function getMonthName(m) { const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']; return names[m - 1]; }

function createMonthObject(y, m) {
    const id = `${y}-${m.toString().padStart(2, '0')}`;
    return { id: id, nombre: getMonthName(m), deudas: { 'Nu': nuSchedule[id] || 0, 'BBVA': 0, 'Mercado Pago': 0 }, pagos: [], gastosPersonales: [], pagado: false };
}

function generateInitialData() {
    let initData = [];
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    for(let i=0; i<10; i++) {
        initData.push(createMonthObject(y, m));
        m++; if(m>12){m=1; y++;}
    }
    return initData;
}

function syncMonths() {
    let savedData = localStorage.getItem(DB_KEY_DATA);
    
    // Rescate Robustoc Extremo
    if (!savedData) {
        for (let i = 22; i >= 7; i--) {
            let rescate = localStorage.getItem(`miGestorFinancieroData_v${i}`);
            if (rescate && rescate.length > 20) { savedData = rescate; break; }
        }
    }

    if (savedData) { try { financeData = JSON.parse(savedData); } catch(e) { financeData = []; } }
    if (!Array.isArray(financeData)) financeData = [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth() + 1; 

    if (financeData.length === 0) {
        financeData = generateInitialData();
    } else {
        // TRADUCTOR BLINDADO
        financeData.forEach((d, i) => {
            if(!d || typeof d !== 'object') d = {}; 
            
            if(!d.id) {
                let m = currentMonthNum + i;
                let y = currentYear + Math.floor((m-1)/12);
                m = ((m-1)%12)+1;
                d.id = `${y}-${m.toString().padStart(2,'0')}`;
            }
            
            // Limpieza y seguridad en el nombre
            if(!d.nombre || String(d.nombre).includes("undefined") || String(d.nombre).trim() === "") {
                let mStr = String(d.id).split('-')[1];
                let mNum = mStr ? parseInt(mStr) : currentMonthNum;
                d.nombre = getMonthName(mNum);
            }
            d.nombre = String(d.nombre).replace(/\s*\(Actual\)/g, '').trim();
            
            // Seguridad en Arrays
            if (!d.deudas) d.deudas = { 'Nu': nuSchedule[d.id] || 0, 'BBVA': 0, 'Mercado Pago': 0 };
            else if (d.deudas['Nu'] === 0 && nuSchedule[d.id]) d.deudas['Nu'] = nuSchedule[d.id];
            
            if (!Array.isArray(d.gastosPersonales)) d.gastosPersonales = [];
            if (!Array.isArray(d.pagos)) d.pagos = [];
        });

        // LIMPIEZA INTELIGENTE POR LÍMITE DE PAGO
        try {
            while(financeData.length > 0) {
                let first = financeData[0];
                if (!first || !first.id) break;
                
                let parts = String(first.id).split('-');
                let y = parseInt(parts[0]);
                let m = parseInt(parts[1]); 
                if (isNaN(y) || isNaN(m)) break;

                let limiteDate = new Date(y, m, diaLimite, 23, 59, 59);

                if (first.pagado === true || now > limiteDate) {
                    let dropped = financeData.shift();
                    historialData.push(dropped); 
                    localStorage.setItem(DB_KEY_HISTORY, JSON.stringify(historialData));
                } else {
                    break; 
                }
            }
        } catch (e) { console.error("Error limpiando meses", e); }
        
        // RELLENAR MESES
        try {
            while(financeData.length < 10) {
                if(financeData.length === 0) {
                    financeData.push(createMonthObject(currentYear, currentMonthNum));
                } else {
                    let lastItem = financeData[financeData.length - 1];
                    let parts = String(lastItem.id).split('-');
                    let y = parseInt(parts[0]) || currentYear; 
                    let m = (parseInt(parts[1]) || currentMonthNum) + 1;
                    if (m > 12) { y++; m = 1; }
                    financeData.push(createMonthObject(y, m));
                }
            }
        } catch(e) { console.error("Error rellenando meses", e); }
    }
    saveData();
}

function loadData() { const s = localStorage.getItem(DB_KEY_DATA); if(s) financeData = JSON.parse(s); }
function saveData() {
    localStorage.setItem(DB_KEY_DATA, JSON.stringify(financeData));
    localStorage.setItem(DB_KEY_FIJOS, JSON.stringify(gastosFijos));
}

// --- 3. RESPALDO Y CONFIRMACIONES ---
window.exportData = function() {
    const dataToSave = { data: financeData, ingreso: ingresoSemanalBase, fijos: gastosFijos, historial: historialData };
    const blob = new Blob([JSON.stringify(dataToSave)], {type: "application/json"});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'gestor_financiero_backup.json'; a.click();
}
window.importData = function(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if(imported.data) localStorage.setItem(DB_KEY_DATA, JSON.stringify(imported.data));
            if(imported.ingreso !== undefined) localStorage.setItem(DB_KEY_INCOME, imported.ingreso);
            if(imported.fijos) localStorage.setItem(DB_KEY_FIJOS, JSON.stringify(imported.fijos));
            if(imported.historial) localStorage.setItem(DB_KEY_HISTORY, JSON.stringify(imported.historial));
            alert("¡Datos restaurados con éxito!"); location.reload();
        } catch (err) { alert("El archivo no es válido."); }
    };
    reader.readAsText(file);
}

// SISTEMA DE MODAL UNIVERSAL PARA CONFIRMACIONES
let actionToConfirm = null;

function abrirModalConfirmacion(titulo, mensaje, actionCallback, colorBoton = 'var(--accent-purple)') {
    document.getElementById('confirm-title').innerText = titulo;
    document.getElementById('confirm-msg').innerText = mensaje;
    document.getElementById('btn-confirm-action').style.backgroundColor = colorBoton;
    actionToConfirm = actionCallback;
    document.getElementById('modal-confirmacion').classList.add('active');
}

window.cerrarModalConfirmacion = function() {
    document.getElementById('modal-confirmacion').classList.remove('active');
    actionToConfirm = null;
}

document.getElementById('btn-confirm-action').addEventListener('click', () => {
    if (actionToConfirm) actionToConfirm();
    cerrarModalConfirmacion();
});

// AJUSTES E INGRESOS MODALES
window.abrirModalAjustes = function() {
    document.getElementById('input-dia-corte').value = diaCorte;
    document.getElementById('input-dia-limite').value = diaLimite;
    document.getElementById('modal-ajustes').classList.add('active');
}
window.cerrarModalAjustes = function() { document.getElementById('modal-ajustes').classList.remove('active'); }
window.guardarAjustes = function() {
    let c = parseInt(document.getElementById('input-dia-corte').value);
    let l = parseInt(document.getElementById('input-dia-limite').value);
    if(c >= 1 && c <= 31 && l >= 1 && l <= 31) {
        diaCorte = c; diaLimite = l;
        localStorage.setItem('miGestorCorte', diaCorte);
        localStorage.setItem('miGestorLimite', diaLimite);
        syncMonths(); renderCards(); cerrarModalAjustes();
    } else { alert("Fechas inválidas."); }
}

window.abrirModalIngreso = function() {
    document.getElementById('input-ingreso-semanal').value = ingresoSemanalBase;
    document.getElementById('modal-ingreso').classList.add('active');
    setTimeout(() => { document.getElementById('input-ingreso-semanal').focus(); }, 100);
}
window.cerrarModalIngreso = function() { document.getElementById('modal-ingreso').classList.remove('active'); }
window.guardarIngreso = function() {
    let v = parseFloat(document.getElementById('input-ingreso-semanal').value);
    if(!isNaN(v) && v >= 0) {
        ingresoSemanalBase = v;
        localStorage.setItem(DB_KEY_INCOME, ingresoSemanalBase);
        renderCards(); cerrarModalIngreso();
    } else { alert("Monto inválido."); }
}
window.handleIngresoEnter = function(e) { if(e.key === 'Enter') guardarIngreso(); }

window.marcarMesPagado = function(idx, mName) {
    abrirModalConfirmacion(`Marcar ${mName} Pagado`, "Este mes se moverá a tu historial permanentemente.", () => {
        financeData[idx].pagado = true;
        saveData(); syncMonths(); renderCards();
    }, "var(--accent-green)");
}

// --- 4. RENDERIZADO PRINCIPAL DE TARJETAS ---
window.toggleAccordion = function(id) { 
    accordionState[id] = accordionState[id] === false ? true : false; 
    renderCards(); 
}

function renderCards() {
    const container = document.getElementById('months-container');
    container.innerHTML = ''; 
    document.getElementById('ingreso-semanal-display').innerText = formatMoney(ingresoSemanalBase);
    
    // Suma segura de fijos
    let sumaFijos = 0;
    if(Array.isArray(gastosFijos)) {
        sumaFijos = gastosFijos.reduce((acc, f) => acc + (parseFloat(f.monto) || 0), 0);
    }
    document.getElementById('gastos-fijos-display').innerText = formatMoney(sumaFijos);

    let sumaDeTodoElAno = 0;
    const ingresoMensual = ingresoSemanalBase * 4;
    const now = new Date();

    if(!Array.isArray(financeData)) return;

    financeData.forEach((data, index) => {
        let sumaGastosMes = 0; let sumaPagosMes = 0;
        let sumaTodasTarjetasMes = (data.deudas && data.deudas['Nu'] ? data.deudas['Nu'] : 0) + 
                                   (data.deudas && data.deudas['BBVA'] ? data.deudas['BBVA'] : 0) + 
                                   (data.deudas && data.deudas['Mercado Pago'] ? data.deudas['Mercado Pago'] : 0);
                                   
        let currentTab = activeTabState[index] || 'Nu';
        let deudaTabActual = (data.deudas && data.deudas[currentTab]) ? data.deudas[currentTab] : 0;

        let logoSrc = 'assets/img/Nu.jpg'; let textClass = 'text-Nu';
        if(currentTab === 'BBVA') { logoSrc = 'assets/img/bbva.png'; textClass = 'text-BBVA';}
        if(currentTab === 'Mercado Pago') { logoSrc = 'assets/img/mercadoapgo.png'; textClass = 'text-MP'; }

        let tarjetaContentHtml = '';
        if (editingCardIndex == index) {
            tarjetaContentHtml = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${logoSrc}" class="bank-logo" onerror="this.style.display='none'">
                    <span style="font-weight: 600;">${currentTab}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <input type="number" id="edit-monto-${index}" class="input-monto-edit" value="${deudaTabActual}" onkeypress="handleCardEnter(event, ${index}, '${currentTab}')">
                    <button class="btn-action-fa btn-save-fa" onclick="guardarEdicionTarjeta(${index}, '${currentTab}')"><i class="fa-solid fa-check"></i></button>
                    <button class="btn-action-fa btn-cancel-fa" onclick="cancelarEdicionTarjeta()"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
        } else {
            tarjetaContentHtml = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${logoSrc}" class="bank-logo" onerror="this.style.display='none'">
                    <span style="font-weight: 600;">${currentTab}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <strong class="${textClass}" style="font-size: 1.15rem;">${formatMoney(deudaTabActual)}</strong>
                    <button class="btn-action-fa btn-edit-fa" onclick="editarTarjeta(${index})"><i class="fa-solid fa-pen"></i></button>
                </div>
            `;
        }

        let listaGastosHtml = '';
        if(Array.isArray(gastosFijos)) {
            gastosFijos.forEach((fijo, fIdx) => {
                sumaGastosMes += (parseFloat(fijo.monto) || 0);
                listaGastosHtml += `<div class="list-item" style="opacity: 0.85;"><span><i class="fa-solid fa-repeat text-yellow" style="margin-right: 8px;"></i>${fijo.concepto}</span><div style="display:flex; align-items:center;"><strong>${formatMoney(fijo.monto)}</strong><button class="btn-delete-fa" onclick="promptEliminarGastoFijo(${fIdx})"><i class="fa-solid fa-trash-can"></i></button></div></div>`;
            });
        }
        
        if(Array.isArray(data.gastosPersonales)) {
            data.gastosPersonales.forEach((gasto, gIdx) => {
                sumaGastosMes += (parseFloat(gasto.monto) || 0);
                listaGastosHtml += `<div class="list-item"><span><i class="fa-solid fa-cart-shopping text-red" style="margin-right: 8px;"></i>${gasto.concepto}</span><div style="display: flex; align-items: center;"><strong>${formatMoney(gasto.monto)}</strong><button class="btn-delete-fa" onclick="promptEliminarGasto(${index}, ${gIdx})"><i class="fa-solid fa-trash-can"></i></button></div></div>`;
            });
        }
        if (!listaGastosHtml) listaGastosHtml = '<div style="text-align: center; color: var(--text-secondary); font-size: 0.85rem;">Sin gastos este mes</div>';

        let listaPagosHtml = '';
        if(Array.isArray(data.pagos)) {
            data.pagos.forEach((pago, pIdx) => {
                sumaPagosMes += (parseFloat(pago.monto) || 0);
                listaPagosHtml += `<div class="list-item"><span><i class="fa-solid fa-circle-dollar-to-slot text-green" style="margin-right: 8px;"></i>Pago #${pIdx + 1}</span><div style="display: flex; align-items: center;"><strong class="text-green">- ${formatMoney(pago.monto)}</strong><button class="btn-delete-fa" onclick="promptEliminarPago(${index}, ${pIdx})"><i class="fa-solid fa-trash-can"></i></button></div></div>`;
            });
        }
        if (!listaPagosHtml) listaPagosHtml = '<div style="text-align: center; color: var(--text-secondary); font-size: 0.85rem;">Aún no hay abonos</div>';

        sumaDeTodoElAno += (sumaTodasTarjetasMes + (Array.isArray(data.gastosPersonales) ? data.gastosPersonales.reduce((a,g)=>a+(parseFloat(g.monto)||0),0) : 0) - sumaPagosMes);
        
        let totalEsperadoMes = sumaTodasTarjetasMes + sumaGastosMes;
        let totalRestanteMes = Math.max(0, totalEsperadoMes - sumaPagosMes); 
        let porcentajeProgreso = totalEsperadoMes > 0 ? Math.min(100, (sumaPagosMes / totalEsperadoMes) * 100) : 0;

        let progressColorClass = 'safe'; 
        let totalTextColor = 'var(--text-primary)';
        if (totalRestanteMes > ingresoMensual) {
            progressColorClass = 'danger'; totalTextColor = 'var(--accent-red)';
        } else if (totalRestanteMes > ingresoMensual * 0.8) {
            progressColorClass = 'warn'; totalTextColor = 'var(--accent-yellow)';
        }

        let partesId = (data.id || "").split('-');
        let yNum = parseInt(partesId[0]) || now.getFullYear();
        let mNum = parseInt(partesId[1]) || (now.getMonth() + 1);
        let mName = data.nombre || "Mes";
        let nombreBase = `${mName} ${yNum}`;
        let tituloMesDisplay = index === 0 ? `${nombreBase} (Actual)` : nombreBase;
        
        let consejoSemanalHtml = '';
        let btnPagarHtml = '';

        if (index === 0) {
            document.getElementById('proximo-pago-title').innerText = `Total a Pagar (${nombreBase})`;
            document.getElementById('proximo-pago').innerText = formatMoney(totalRestanteMes);
            if (totalRestanteMes > 0) {
                let ahorro = totalRestanteMes / 4;
                if (ahorro <= ingresoSemanalBase) {
                    consejoSemanalHtml = `<div class="weekly-tip-neutral"><i class="fa-solid fa-lightbulb" style="margin-right: 6px;"></i> Meta Semanal: Guarda <strong>${formatMoney(ahorro)}</strong> de tus ingresos. Te quedan libres <strong>${formatMoney(ingresoSemanalBase - ahorro)}</strong>.</div>`;
                } else {
                    consejoSemanalHtml = `<div class="weekly-tip"><i class="fa-solid fa-triangle-exclamation" style="margin-right: 6px;"></i> Cuidado: Tus deudas del mes superan tus ingresos semanales de ${formatMoney(ingresoSemanalBase)}.</div>`;
                }
            }

            // BOTÓN MARCAR COMO PAGADO (Solo aparece si la fecha de hoy coincide)
            let corteDate = new Date(yNum, mNum - 1, diaCorte); 
            let limiteDate = new Date(yNum, mNum, diaLimite, 23, 59, 59); 
            
            if (now >= corteDate && now <= limiteDate) {
                btnPagarHtml = `<button class="btn-pay-month" onclick="marcarMesPagado(${index}, '${mName}')"><i class="fa-solid fa-check-double"></i> Marcar ${mName} como Pagado</button>`;
            }
        }

        let gastosOpen = accordionState[`gastos-${index}`] !== false; 
        let pagosOpen = accordionState[`pagos-${index}`] !== false; 

        const cardHtml = `
            <div class="month-card">
                <div class="month-header"><h2>${tituloMesDisplay}</h2></div>
                ${consejoSemanalHtml}
                
                <div class="inner-section" style="padding: 10px 15px; margin-bottom: 10px;">
                    <div class="card-tabs">
                        <div class="card-tab ${currentTab === 'Nu' ? 'active' : ''}" onclick="cambiarTab(${index}, 'Nu')">Nu</div>
                        <div class="card-tab ${currentTab === 'BBVA' ? 'active' : ''}" onclick="cambiarTab(${index}, 'BBVA')">BBVA</div>
                        <div class="card-tab ${currentTab === 'Mercado Pago' ? 'active' : ''}" onclick="cambiarTab(${index}, 'Mercado Pago')">MP</div>
                    </div>
                </div>
                <div class="bank-debt-card">${tarjetaContentHtml}</div>
                
                <div class="inner-section border-red" style="border-left: 3px solid var(--accent-red);">
                    <div class="section-header-flex">
                        <div class="section-toggle" onclick="toggleAccordion('gastos-${index}')">
                            <i class="fa-solid fa-chevron-${gastosOpen ? 'up' : 'down'} chevron"></i>
                            <span class="title-red"><i class="fa-solid fa-tags"></i> Otros Gastos y MSI</span>
                        </div>
                        <button class="btn-mini-add" onclick="abrirModalDesdeSeccion(${index}, 'gasto')" title="Añadir Gasto"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div class="collapsible-content" style="display: ${gastosOpen ? 'block' : 'none'};">
                        ${listaGastosHtml}
                    </div>
                </div>

                <div class="inner-section border-green" style="border-left: 3px solid var(--accent-green);">
                    <div class="section-header-flex">
                        <div class="section-toggle" onclick="toggleAccordion('pagos-${index}')">
                            <i class="fa-solid fa-chevron-${pagosOpen ? 'up' : 'down'} chevron"></i>
                            <span class="title-green"><i class="fa-solid fa-circle-check"></i> Pagos Realizados</span>
                        </div>
                        <button class="btn-mini-add" onclick="abrirModalDesdeSeccion(${index}, 'pago')" title="Añadir Pago"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div class="collapsible-content" style="display: ${pagosOpen ? 'block' : 'none'};">
                        ${listaPagosHtml}
                    </div>
                </div>

                <div class="total-row"><span class="total-title">Total a Pagar</span><span class="total-value" style="color: ${totalTextColor};">${formatMoney(totalRestanteMes)}</span></div>
                <div class="progress-container"><div class="progress-bar ${progressColorClass}" style="width: ${porcentajeProgreso}%"></div></div>
                <div class="progress-text">${porcentajeProgreso.toFixed(0)}% Cubierto</div>
                ${btnPagarHtml}
            </div>`;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });

    document.getElementById('total-deuda-global').innerText = formatMoney(sumaDeTodoElAno);
}

// --- 5. LOGICA DEL MODAL DE TRANSACCIÓN Y ENTER KEY ---
window.abrirModalDesdeSeccion = function(mesIdx, tipo) {
    activeTransactionMonth = mesIdx;
    
    let mName = financeData[mesIdx].nombre;
    let yStr = (financeData[mesIdx].id || "").split('-')[0] || new Date().getFullYear();
    let name = mesIdx === 0 ? `${mName} ${yStr} (Actual)` : `${mName} ${yStr}`;
    
    document.getElementById('modal-trans-title').innerText = tipo === 'gasto' ? `Añadir Concepto en ${name}` : `Abonar a ${name}`;
    document.getElementById('form-gasto').style.display = tipo === 'gasto' ? 'block' : 'none';
    document.getElementById('form-pago').style.display = tipo === 'pago' ? 'block' : 'none';
    currentTransactionType = tipo;
    
    document.getElementById('modal-transaccion').classList.add('active');
    
    setTimeout(() => {
        if(tipo === 'gasto') document.getElementById('trans-concepto').focus();
        else document.getElementById('trans-monto-pago').focus();
    }, 100);
}

window.cerrarModalTransaccion = function() { document.getElementById('modal-transaccion').classList.remove('active'); }

window.procesarTransaccionModal = function() {
    if(isProcessing) return;
    isProcessing = true;

    const idx = activeTransactionMonth;

    if (currentTransactionType === 'pago') {
        const monto = parseFloat(document.getElementById('trans-monto-pago').value);
        if (isNaN(monto) || monto <= 0) { alert("Ingresa una cantidad válida"); isProcessing = false; return; }
        
        financeData[idx].pagos.push({ monto: monto });
        document.getElementById('trans-monto-pago').value = '';
        accordionState[`pagos-${idx}`] = true;
    } else {
        const concepto = document.getElementById('trans-concepto').value.trim() || 'Gasto';
        const monto = parseFloat(document.getElementById('trans-monto-gasto').value);
        const msi = parseInt(document.getElementById('trans-msi').value) || 1;
        
        if (isNaN(monto) || monto <= 0) { alert("Ingresa una cantidad válida"); isProcessing = false; return; }

        const montoMensual = monto / msi;

        for (let i = 0; i < msi; i++) {
            let tIdx = idx + i;
            while(tIdx >= financeData.length) {
                let last = financeData[financeData.length - 1];
                let parts = last.id.split('-'); let y = parseInt(parts[0]); let m = parseInt(parts[1]) + 1;
                if (m > 12) { y++; m = 1; }
                financeData.push(createMonthObject(y, m));
            }
            let etq = msi > 1 ? `${concepto} (${i+1}/${msi})` : concepto;
            financeData[tIdx].gastosPersonales.push({ concepto: etq, monto: montoMensual });
        }
        
        document.getElementById('trans-concepto').value = '';
        document.getElementById('trans-monto-gasto').value = '';
        document.getElementById('trans-msi').value = '1';
        accordionState[`gastos-${idx}`] = true;
    }
    
    saveData(); renderCards(); cerrarModalTransaccion();
    setTimeout(() => { isProcessing = false; }, 300);
}

window.handleModalEnter = function(e) { if (e.key === 'Enter') procesarTransaccionModal(); }
window.handleCardEnter = function(e, mesIdx, banco) { if (e.key === 'Enter') guardarEdicionTarjeta(mesIdx, banco); }

// --- 6. FUNCIONES DE EDICIÓN Y ELIMINACIÓN DE TARJETAS ---
window.cambiarTab = function(mesIdx, tabName) { activeTabState[mesIdx] = tabName; editingCardIndex = null; renderCards(); }
window.editarTarjeta = function(mesIdx) { editingCardIndex = mesIdx; renderCards(); }
window.cancelarEdicionTarjeta = function() { editingCardIndex = null; renderCards(); }
window.guardarEdicionTarjeta = function(mesIdx, banco) {
    const input = document.getElementById(`edit-monto-${mesIdx}`);
    const v = parseFloat(input.value);
    if(!isNaN(v) && v >= 0) { financeData[mesIdx].deudas[banco] = v; saveData(); editingCardIndex = null; renderCards(); }
}
window.promptEliminarGasto = function(m, i) { 
    abrirModalConfirmacion("Eliminar Concepto", "¿Estás seguro de borrar este gasto?", () => {
        financeData[m].gastosPersonales.splice(i, 1); saveData(); renderCards(); 
    }, "var(--accent-red)");
}
window.promptEliminarPago = function(m, i) { 
    abrirModalConfirmacion("Eliminar Abono", "¿Estás seguro de borrar este abono?", () => {
        financeData[m].pagos.splice(i, 1); saveData(); renderCards(); 
    }, "var(--accent-red)");
}

// --- 7. MODALES SECUNDARIOS (FIJOS E HISTORIAL) ---
const modalFijos = document.getElementById('modal-fijos');
const modalHistorial = document.getElementById('modal-historial');

window.abrirModalFijos = function() {
    const l = document.getElementById('lista-fijos-modal'); l.innerHTML = '';
    if(gastosFijos.length===0) l.innerHTML = '<div style="text-align:center; color: var(--text-secondary); padding: 15px 0;">Sin fijos</div>';
    gastosFijos.forEach((f, i) => l.innerHTML += `<div class="list-item"><span><i class="fa-solid fa-repeat text-yellow"></i> ${f.concepto}</span><div><strong>${formatMoney(f.monto)}</strong><button class="btn-delete-fa" onclick="promptEliminarGastoFijo(${i})"><i class="fa-solid fa-trash-can"></i></button></div></div>`);
    modalFijos.classList.add('active');
}
window.cerrarModalFijos = function() { modalFijos.classList.remove('active'); renderCards(); }
window.agregarGastoFijo = function() {
    const c = document.getElementById('nuevo-fijo-concepto').value.trim(); const m = parseFloat(document.getElementById('nuevo-fijo-monto').value);
    if(c && m>0){ gastosFijos.push({concepto:c, monto:m}); saveData(); document.getElementById('nuevo-fijo-concepto').value=''; document.getElementById('nuevo-fijo-monto').value=''; abrirModalFijos(); }
}
window.promptEliminarGastoFijo = function(i) {
    abrirModalConfirmacion("Eliminar Suscripción", "¿Dejar de inyectar este gasto en los meses?", () => {
        gastosFijos.splice(i, 1); saveData(); abrirModalFijos();
    }, "var(--accent-red)");
}
document.getElementById('nuevo-fijo-monto').addEventListener('keypress', (e) => { if(e.key === 'Enter') agregarGastoFijo(); });

window.abrirModalHistorial = function() {
    const l = document.getElementById('lista-historial-modal'); l.innerHTML = '';
    if(historialData.length===0) l.innerHTML = '<div style="text-align:center; color: var(--text-secondary); padding: 15px 0;">Aún no hay meses pasados.</div>';
    [...historialData].reverse().forEach(mes => {
        let dR = Math.max(0, (mes.deudas['Nu']||0)+(mes.deudas['BBVA']||0)+(mes.deudas['Mercado Pago']||0) + (Array.isArray(mes.gastosPersonales) ? mes.gastosPersonales.reduce((a,c)=>a+(parseFloat(c.monto)||0),0) : 0) - (Array.isArray(mes.pagos) ? mes.pagos.reduce((a,c)=>a+(parseFloat(c.monto)||0),0) : 0));
        let mName = mes.nombre && mes.nombre !== "undefined" ? mes.nombre : (mes.mes || "Mes");
        let mYear = mes.id ? mes.id.split('-')[0] : '';
        l.innerHTML += `<div class="inner-section" style="border: 1px solid var(--border-color); margin-bottom: 10px;"><div style="display:flex; justify-content: space-between; font-weight: bold; margin-bottom: 5px;"><span>${mName} ${mYear}</span><span class="text-purple">${formatMoney(dR)} Restante</span></div></div>`;
    });
    modalHistorial.classList.add('active');
}
window.cerrarModalHistorial = function() { modalHistorial.classList.remove('active'); }

window.addEventListener('DOMContentLoaded', () => { syncMonths(); loadData(); renderCards(); });