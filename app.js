const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = { vendedores: [], ventas: [], productos: [], clientes: [] };
let graficos = { genV: null, genD: null, genL: null, genR: null, genRVenta: null, vendV: null, vendD: null, cliL: null };
let mapasInstancias = { general: null, vendedor: null, situacion: null };

// =========================================
// UTILIDADES NORMALIZADORAS Y MATEMÁTICAS
// =========================================
function normalizarTexto(t) { return t ? String(t).replace(/\s+/g, ' ').trim().toUpperCase() : ''; }

function getColExacto(obj, opciones) {
    if(!obj) return null;
    let keys = Object.keys(obj);
    for (let op of opciones) { let opL = normalizarTexto(op); let found = keys.find(k => normalizarTexto(k) === opL); if(found) return found; }
    for (let op of opciones) { let opL = normalizarTexto(op); let found = keys.find(k => normalizarTexto(k).includes(opL)); if(found) return found; }
    return keys[0]; 
}

function parseNum(val) { let num = parseFloat(String(val||'').replace(/,/g, '')); return isNaN(num) ? 0 : num; }
function formatearMoneda(val) { return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val); }

function parseFechaEstricta(dStr) {
    if(!dStr) return null;
    let parts = String(dStr).split(' ')[0].split('/');
    if(parts.length !== 3) return null;
    let day = parts[0].padStart(2, '0'); let month = parts[1].padStart(2, '0'); let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return { string: `${day}/${month}`, sortValue: new Date(`${year}-${month}-${day}T12:00:00`).getTime() };
}

function cargarCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, { download: true, header: true, skipEmptyLines: true, complete: res => resolve(res.data), error: err => reject(err) });
    });
}

// =========================================
// SEGURIDAD AUTOMÁTICA
// =========================================
function evaluarTeclado(e) { if (e.key === 'Enter') verificarPassword(); }
function verificarPassword() {
    if (btoa(document.getElementById('passInput').value) === "RGlhbGV4MTIz") {
        document.getElementById('loginScreen').style.opacity = '0';
        setTimeout(() => { document.getElementById('loginScreen').style.display = 'none'; document.getElementById('loadingScreen').style.display = 'flex'; inicializarApp(); }, 300);
    } else {
        document.getElementById('loginError').style.display = 'block';
    }
}

async function inicializarApp() {
    try {
        const [resVend, resVent, resProd, resCli] = await Promise.all([cargarCSV(urls.vendedores), cargarCSV(urls.ventas), cargarCSV(urls.productos), cargarCSV(urls.clientes)]);
        db.vendedores = resVend; db.ventas = resVent; db.productos = resProd; db.clientes = resCli;
        
        generarMenuVendedores();
        cambiarModulo('general', document.querySelector('.modulos-list li'));
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
    } catch (e) { 
        document.getElementById('spinner').style.display = 'none'; 
        document.getElementById('loadingTitle').textContent = "Error de Conexión de Red"; 
        document.getElementById('loadingTitle').style.color = '#d93025'; 
    }
}

// =========================================
// CONTROLADOR DE PESTAÑAS Y MODULOS
// =========================================
function cambiarModulo(modulo, elemento) {
    document.querySelectorAll('.modulos-list li').forEach(el => el.classList.remove('active'));
    if(elemento) elemento.classList.add('active');
    
    document.querySelectorAll('.modulo-view').forEach(el => el.style.display = 'none');
    document.getElementById('menuVendedoresContainer').style.display = 'none';
    
    if (modulo === 'general') {
        document.getElementById('vistaGeneral').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Vista General Comercial';
        cargarDataGeneral();
    } else if (modulo === 'productividad') {
        document.getElementById('vistaProductividad').style.display = 'block';
        document.getElementById('menuVendedoresContainer').style.display = 'flex';
        document.getElementById('tituloDashboard').textContent = 'Análisis de Productividad';
        
        let actLi = document.querySelector('#listaVendedoresHorizontal li.active');
        if(!actLi) { let pV = document.querySelector('#listaVendedoresHorizontal li'); if(pV) pV.click(); } 
        else { actLi.click(); }
    } else if (modulo === 'situacion') {
        document.getElementById('vistaSituacion').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Estrategia de Rentabilidad';
        cargarDataSituacion();
    } else if (modulo === 'busqueda') {
        document.getElementById('vistaBusqueda').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Directorio Analítico';
        llenarTablaDirectorio();
    }
}

function generarMenuVendedores() {
    const lista = document.getElementById('listaVendedoresHorizontal');
    lista.innerHTML = '';
    let cM = getColExacto(db.vendedores[0], ['META']); let cN = getColExacto(db.vendedores[0], ['NOMBRE']); let cA = getColExacto(db.vendedores[0], ['APELLIDO']);
    
    db.vendedores.filter(v => parseNum(v[cM]) > 0 && normalizarTexto(v[cN]) !== "RETIRADO").forEach(v => {
        const li = document.createElement('li');
        li.textContent = `${v[cN]} ${v[cA] || ''}`.trim();
        li.onclick = () => {
            document.querySelectorAll('#listaVendedoresHorizontal li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            cargarDataVendedor(v);
        };
        lista.appendChild(li);
    });
}

// =========================================
// MOTOR DE MAPEO GEOGRÁFICO COHESIVO
// =========================================
function inyectarMapaNacional(idContenedorPadre, arrayCliData) {
    if (mapasInstancias[idContenedorPadre]) {
        mapasInstancias[idContenedorPadre].remove();
        mapasInstancias[idContenedorPadre] = null;
    }
    
    let padre = document.getElementById(idContenedorPadre);
    padre.innerHTML = ''; 

    let map = L.map(idContenedorPadre).setView([-9.189967, -75.015152], 5);
    mapasInstancias[idContenedorPadre] = map;
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: 'Dialex B2B' }).addTo(map);

    let cId = getColExacto(db.clientes[0], ['ID_CLIENTE']); let cRz = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE']); let cUb = getColExacto(db.clientes[0], ['UBICACIÓN', 'DIRECCION']);
    let vId = getColExacto(db.ventas[0], ['ID_CLIENTE']); let vPr = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let cColEst = getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO']);
    
    let mapVentas = {}; db.ventas.forEach(v => { let i = normalizarTexto(v[vId]); if(i) mapVentas[i] = (mapVentas[i]||0) + parseNum(v[vPr]); });

    const dicZonas = {
        'AREQUIPA':[-16.40,-71.53], 'CUSCO':[-13.53,-71.96], 'TRUJILLO':[-8.10,-79.02], 'CHICLAYO':[-6.77,-79.84], 'PIURA':[-5.19,-80.62], 
        'IQUITOS':[-3.74,-73.25], 'HUANCAYO':[-12.06,-75.20], 'TACNA':[-18.01,-70.25], 'CAJAMARCA':[-7.16,-78.51], 'PUNO':[-15.84,-70.02], 
        'AYACUCHO':[-13.15,-74.22], 'HUANUCO':[-9.93,-76.24], 'TARAPOTO':[-6.48,-76.36], 'PUCALLPA':[-8.39,-74.55], 'ICA':[-14.06,-75.72], 
        'LURIGANCHO':[-11.97,-76.99], 'ATE':[-12.02,-76.91], 'CALLAO':[-12.05,-77.13], 'PUENTE PIEDRA':[-11.86,-77.07], 'COMAS':[-11.93,-77.04], 
        'SURCO':[-12.13,-76.99], 'MIRAFLORES':[-12.11,-77.03], 'SAN ISIDRO':[-12.09,-77.03], 'LIMA':[-12.04,-77.02] 
    };

    let marcadores = L.featureGroup();

    arrayCliData.forEach(c => {
        let id = normalizarTexto(c[cId]); let raz = c[cRz]||'Cliente Sin Nombre'; let ubi = normalizarTexto(c[cUb]); let vnt = mapVentas[id]||0;
        let est = normalizarTexto(c[cColEst]);
        let coord = dicZonas['LIMA'];
        for(let z in dicZonas) { if(ubi.includes(z)) { coord = dicZonas[z]; break; } }
        
        let rad = Math.random() * 0.03; let ang = Math.random() * Math.PI * 2;
        let lat = coord[0] + (Math.sin(ang) * rad); let lng = coord[1] + (Math.cos(ang) * rad);

        let color = est.includes('ACTIVO') ? '#34a853' : '#ea4335';
        let markHtml = `<div style="background-color:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`;
        let icon = L.divIcon({ html: markHtml, className: 'custom-pin', iconSize: [14,14] });

        let m = L.marker([lat, lng], {icon: icon}).bindPopup(`<b>${raz}</b><br>Facturado: S/ ${vnt.toLocaleString()}<br>Estado: ${est||'INACTIVO'}<br><small>${c[cUb]||''}</small>`);
        marcadores.addLayer(m);
    });
    
    if(arrayCliData.length > 0) {
        marcadores.addTo(map);
        map.fitBounds(marcadores.getBounds(), {padding: [25, 25], maxZoom: 11});
    }
    setTimeout(() => { map.invalidateSize(); }, 350);
}

// =========================================
// DATA CORE: PROCESAMIENTO Y MATRICES
// =========================================
function cargarDataGeneral() {
    let vColM = getColExacto(db.vendedores[0], ['META']); let vColIdV = getColExacto(db.vendedores[0], ['ID_VENDEDOR']); let vColT = getColExacto(db.vendedores[0], ['TIPO']);
    let vtColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']); let vtColIdV = getColExacto(db.ventas[0], ['ID_VENDEDOR']); let vtColF = getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']);
    let cColEst = getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO']);
    
    let metaT = db.vendedores.reduce((s, v) => s + parseNum(v[vColM]), 0);
    let vtaT = db.ventas.reduce((s, v) => s + parseNum(v[vtColP]), 0);
    let totalInactivosGlobal = db.clientes.filter(c => !normalizarTexto(c[cColEst]).includes('ACTIVO')).length;
    
    document.getElementById('kpiGeneral').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Total</h4><span>${formatearMoneda(vtaT)}</span></div>
        <div class="kpi-box"><h4>Meta General</h4><span style="color:#333">${formatearMoneda(metaT)}</span></div>
        <div class="kpi-box kpi-clickable" onclick="mostrarModalInactivos('GLOBAL')"><h4>Clientes Inactivos ⚠️</h4><span style="color:#d93025">${totalInactivosGlobal}</span></div>
        <div class="kpi-box"><h4>Total Clientes BD</h4><span style="color:#333">${db.clientes.length}</span></div>
    `;

    let pctG = metaT > 0 ? (vtaT / metaT) * 100 : 0;
    if(graficos.genV) graficos.genV.destroy();
    graficos.genV = new Chart(document.getElementById('chartVelocimetroGeneral').getContext('2d'), { type:'doughnut', data:{datasets:[{data:[vtaT, Math.max(0,metaT-vtaT)], backgroundColor:['#34a853','#dadce0'], borderWidth:0}]}, options:{responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, cutout:'75%', plugins:{legend:{display:false}}} });
    document.getElementById('textoVelocimetroGeneral').textContent = pctG.toFixed(1)+'%';

    let can = {'CALL CENTER':0, 'COBERTURA':0};
    db.ventas.forEach(v => {
        let vend = db.vendedores.find(vd => normalizarTexto(vd[vColIdV]) === normalizarTexto(v[vtColIdV]));
        let t = vend && vend[vColT] ? normalizarTexto(vend[vColT]) : '';
        if(t.includes('CALL')) can['CALL CENTER']+=parseNum(v[vtColP]); else can['COBERTURA']+=parseNum(v[vtColP]);
    });
    
    if(graficos.genD) graficos.genD.destroy();
    graficos.genD = new Chart(document.getElementById('chartDonaGeneral').getContext('2d'), { type:'pie', data:{labels:['Call Center','Cobertura'], datasets:[{data:[can['CALL CENTER'],can['COBERTURA']], backgroundColor:['#1a73e8','#ea4335']}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}} });

    let daily={}; 
    db.ventas.forEach(v=>{ 
        let fObj = parseFechaEstricta(v[vtColF]); if(fObj){ daily[fObj.string] = { val: (daily[fObj.string]?.val || 0) + parseNum(v[vtColP]), sort: fObj.sortValue }; } 
    });
    let arrFechas = Object.keys(daily).map(k => ({ label: k, ...daily[k] })).sort((a,b)=>a.sort-b.sort);
    
    if(graficos.genL) graficos.genL.destroy();
    graficos.genL = new Chart(document.getElementById('chartLineaGeneral').getContext('2d'), { type:'line', data:{labels:arrFechas.map(f=>f.label), datasets:[{label:'Venta Diaria', data:arrFechas.map(f=>f.val), borderColor:'#1a73e8', backgroundColor:'rgba(26, 115, 232, 0.08)', fill:true, tension:0.15}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}} });

    // Ranking 1: Avance de Meta %
    let rankMeta = db.vendedores.filter(v=>parseNum(v[vColM])>0).map(v=>{
        let tot = db.ventas.filter(vt=>normalizarTexto(vt[vtColIdV])===normalizarTexto(v[vColIdV])).reduce((s,vt)=>s+parseNum(vt[vtColP]),0);
        return {n:v[getColExacto(v,['NOMBRE'])], p:(tot/parseNum(v[vColM]))*100};
    }).sort((a,b)=>b.p-a.p);
    
    if(graficos.genR) graficos.genR.destroy();
    graficos.genR = new Chart(document.getElementById('chartRankingMeta').getContext('2d'), { type:'bar', data:{labels:rankMeta.map(r=>r.n), datasets:[{label:'Avance % Meta', data:rankMeta.map(r=>parseFloat(r.p.toFixed(1))), backgroundColor:'#1a73e8', borderRadius:4}]}, options:{responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}} });

    // Ranking 2: Ventas Absolutas sin Meta (S/)
    let rankVentaAbs = db.vendedores.map(v=>{
        let tot = db.ventas.filter(vt=>normalizarTexto(vt[vtColIdV])===normalizarTexto(v[vColIdV])).reduce((s,vt)=>s+parseNum(vt[vtColP]),0);
        return {n:v[getColExacto(v,['NOMBRE'])], t:tot};
    }).sort((a,b)=>b.t-a.t);

    if(graficos.genRVenta) graficos.genRVenta.destroy();
    graficos.genRVenta = new Chart(document.getElementById('chartRankingVenta').getContext('2d'), { type:'bar', data:{labels:rankVentaAbs.map(r=>r.n), datasets:[{label:'Venta Total S/', data:rankVentaAbs.map(r=>r.t), backgroundColor:'#34a853', borderRadius:4}]}, options:{responsive:true, maintainAspectRatio:false, indexAxis:'y', plugins:{legend:{display:false}}} });

    inyectarMapaNacional('mapaGeneral', db.clientes);
}

function cargarDataVendedor(vdData) {
    let idV = normalizarTexto(vdData[getColExacto(vdData, ['ID_VENDEDOR'])]);
    let m = parseNum(vdData[getColExacto(vdData, ['META'])]);
    let vtColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let cColIdV = getColExacto(db.clientes[0], ['ID_VENDEDOR']);
    let cColEst = getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO']);
    
    let sVt = db.ventas.filter(v=>normalizarTexto(v[getColExacto(v,['ID_VENDEDOR'])])===idV);
    let totV = sVt.reduce((s,v)=>s+parseNum(v[vtColP]),0);
    
    let sCli = db.clientes.filter(c=>normalizarTexto(c[cColIdV])===idV);
    let inactivosVendedor = sCli.filter(c => !normalizarTexto(c[cColEst]).includes('ACTIVO')).length;

    document.getElementById('kpiVendedor').innerHTML = `
        <div class="kpi-box destacado"><h4>Logrado Vendedor</h4><span>${formatearMoneda(totV)}</span></div>
        <div class="kpi-box"><h4>Meta Asignada</h4><span style="color:#333">${formatearMoneda(m)}</span></div>
        <div class="kpi-box kpi-clickable" onclick="mostrarModalInactivos('${idV}')"><h4>Clientes Inactivos ⚠️</h4><span style="color:#d93025">${inactivosVendedor}</span></div>
        <div class="kpi-box"><h4>Cartera Total</h4><span style="color:#333">${sCli.length}</span></div>
    `;

    let pctV = m > 0 ? (totV / m) * 100 : 0;
    if(graficos.vendV) graficos.vendV.destroy();
    graficos.vendV = new Chart(document.getElementById('chartVelocimetroVendedor').getContext('2d'), { type:'doughnut', data:{datasets:[{data:[totV, Math.max(0,m-totV)], backgroundColor:['#34a853','#dadce0'], borderWidth:0}]}, options:{responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, cutout:'75%', plugins:{legend:{display:false}}} });
    document.getElementById('textoVelocimetroVendedor').textContent = pctV.toFixed(1)+'%';

    if(graficos.vendD) graficos.vendD.destroy();
    graficos.vendD = new Chart(document.getElementById('chartDonaVendedor').getContext('2d'), { type:'pie', data:{labels:['Logrado','Faltante'], datasets:[{data:[totV, Math.max(0,m-totV)], backgroundColor:['#34a853','#ea4335']}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}} });

    let pCId = getColExacto(db.productos[0], ['ID_VENDEDOR']); let pCNom = getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']);
    let cU={}; let cC={};
    db.productos.filter(p=>normalizarTexto(p[pCId])===idV).forEach(p=>{
        let n=p[pCNom]; let u=parseNum(p[getColExacto(p,['CANTIDAD UNID','UNID'])]); let c=parseNum(p[getColExacto(p,['CANTIDAD CAJA','CAJA'])]);
        if(n){ if(u>0) cU[n]=(cU[n]||0)+u; if(c>0) cC[n]=(cC[n]||0)+c; }
    });
    
    const fillTb = (id, obj) => { 
        let tb=document.querySelector(`#${id} tbody`); tb.innerHTML=''; 
        let keys = Object.keys(obj).sort((a,b)=>obj[b]-obj[a]).slice(0,5); 
        if(keys.length===0){ tb.innerHTML=`<tr><td colspan="2" style="text-align:center; color:#999;">Sin datos en BD</td></tr>`; } 
        else { keys.forEach(k=>tb.innerHTML+=`<tr><td>${k}</td><td class="num-col">${obj[k].toLocaleString()}</td></tr>`); } 
    };
    fillTb('tablaProdUnid', cU); fillTb('tablaProdCaja', cC);

    inyectarMapaNacional('mapaVendedor', sCli);
}

function cargarDataSituacion() {
    let vtColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']); let vtColR = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON']);
    let vT = db.ventas.reduce((s,v)=>s+parseNum(v[vtColP]),0); let lV = db.ventas.length;
    let cColEst = getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO']);
    
    let cC={}; db.ventas.forEach(v=>{ let r=normalizarTexto(v[vtColR]); if(r) cC[r]=(cC[r]||0)+parseNum(v[vtColP]); });
    let totalInactivos = db.clientes.filter(c => !normalizarTexto(c[cColEst]).includes('ACTIVO')).length;
    let clAct = db.clientes.filter(c => normalizarTexto(c[cColEst]).includes('ACTIVO'));

    document.getElementById('kpiSituacion').innerHTML = `
        <div class="kpi-box"><h4>Ticket Promedio</h4><span>${formatearMoneda(lV>0?vT/lV:0)}</span></div>
        <div class="kpi-box"><h4>Frecuencia Compra</h4><span>${Object.keys(cC).length>0 ? (lV/Object.keys(cC).length).toFixed(1) : 0} trans/cli</span></div>
        <div class="kpi-box kpi-clickable" onclick="mostrarModalInactivos('GLOBAL')"><h4>Clientes Inactivos ⚠️</h4><span style="color:#d93025">${totalInactivos}</span></div>
    `;

    let arr = Object.keys(cC).map(k=>({n:k, t:cC[k]})).sort((a,b)=>b.t-a.t);
    let tb = document.querySelector('#tablaABC tbody'); tb.innerHTML=''; let sAc=0;
    arr.forEach(c=>{ 
        sAc+=c.t; let pct=(sAc/vT)*100; 
        let sg=pct<=80?'A (Top Segment)':(pct<=95?'B (Medio)':'C (Bajo Volumen)'); 
        let cs=pct<=80?'badge-a':(pct<=95?'badge-b':'badge-c'); 
        tb.innerHTML+=`<tr><td>${c.n}</td><td><span class="badge ${cs}">${sg}</span></td><td class="num-col">${formatearMoneda(c.t)}</td></tr>`; 
    });

    inyectarMapaNacional('mapaSituacion', clAct);
}

// =========================================
// DIRECTORIO AVANZADO + CAMPO CELULAR
// =========================================
function llenarTablaDirectorio() {
    let tb = document.querySelector('#tablaDirectorioClientes tbody'); tb.innerHTML='';
    let docC = getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI']); 
    let razC = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE']);
    let celC = getColExacto(db.clientes[0], ['CELULAR', 'TELEFONO', 'CEL']);
    
    db.clientes.forEach(c=>{
        let d = c[docC]||'---'; let r = c[razC]||'---';
        let cel = c[celC] ? String(c[celC]).trim() : '';
        if(!cel || cel === '0') cel = 'Próximamente';

        let tr = document.createElement('tr'); tr.className = 'fila-cliente';
        tr.innerHTML = `<td>${d}</td><td><b>${r}</b></td><td style="color:#555;">${cel}</td>`;
        tr.onclick = () => mostrarDetalleCliente(d, r, tr);
        tb.appendChild(tr);
    });
}

function filtrarDirectorioClientes() {
    let input = normalizarTexto(document.getElementById("inputBusquedaCliente").value);
    document.querySelectorAll('#tablaDirectorioClientes .fila-cliente').forEach(f => { 
        f.style.display = normalizarTexto(f.textContent).includes(input) ? "" : "none"; 
    });
}

function mostrarDetalleCliente(doc, razon, trActivo) {
    document.querySelectorAll('#tablaDirectorioClientes .fila-cliente').forEach(f => f.classList.remove('activa'));
    if(trActivo) trActivo.classList.add('activa');
    
    let panel = document.getElementById('panelDetalleCliente');
    panel.style.display = 'block';
    
    if (window.innerWidth <= 1024) { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    
    document.getElementById('detalleNombreCliente').textContent = razon;
    document.getElementById('detalleDocCliente').textContent = doc;

    let celC = getColExacto(db.clientes[0], ['CELULAR', 'TELEFONO', 'CEL']);
    let dbCli = db.clientes.find(c => normalizarTexto(c[getColExacto(c,['Documento_Numero', 'RUC'])]).includes(normalizarTexto(doc)));
    let rawCel = dbCli ? dbCli[celC] : '';
    document.getElementById('detalleCelCliente').textContent = (rawCel && rawCel!=='0') ? rawCel : 'Próximamente';
    
    let estado = dbCli ? normalizarTexto(dbCli[getColExacto(dbCli,['ESTADO DE VENTA', 'ESTADO'])]) : 'INACTIVO';
    document.getElementById('detalleEstadoCli').innerHTML = `<span class="badge ${estado.includes('ACTIVO')?'badge-activo':'badge-inactivo'}">${estado||'INACTIVO'}</span>`;

    let vColR = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON']); let vColD = getColExacto(db.ventas[0], ['Documento_Numero', 'RUC']); let vColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']); let vColF = getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']);
    
    let susVtas = db.ventas.filter(v => (normalizarTexto(v[vColR])===normalizarTexto(razon) && razon) || (v[vColD]===doc && doc));
    document.getElementById('detalleTotalVenta').textContent = formatearMoneda(susVtas.reduce((s,v)=>s+parseNum(v[vColP]),0));
    
    let hist={}; 
    susVtas.forEach(v=>{ let fObj = parseFechaEstricta(v[vColF]); if(fObj){ hist[fObj.string] = { val: (hist[fObj.string]?.val || 0) + parseNum(v[vColP]), sort: fObj.sortValue }; } });
    let hArr = Object.keys(hist).map(k => ({ label: k, ...hist[k] })).sort((a,b)=>a.sort-b.sort);

    if(graficos.cliL) graficos.cliL.destroy();
    graficos.cliL = new Chart(document.getElementById('chartClienteHistorial').getContext('2d'), { type:'bar', data:{labels:hArr.map(f=>f.label), datasets:[{label:'S/', data:hArr.map(f=>f.val), backgroundColor:'#34a853', borderRadius:4}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}} });

    let pColR = getColExacto(db.productos[0], ['RAZÓN SOCIAL', 'RAZON']); let pColD = getColExacto(db.productos[0], ['Documento_Numero', 'RUC']); let pColN = getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']); let pColC = getColExacto(db.productos[0], ['CANTIDAD CAJA', 'CAJA']); let pColU = getColExacto(db.productos[0], ['CANTIDAD UNID', 'UNID']);
    let prds={}; db.productos.filter(p=>(normalizarTexto(p[pColR])===normalizarTexto(razon) && razon)||(p[pColD]===doc && doc)).forEach(p=>{
        let n=p[pColN]; let u=parseNum(p[pColU]); let c=parseNum(p[pColC]);
        if(n){ if(!prds[n]) prds[n]={u:0,c:0}; prds[n].u+=u; prds[n].c+=c; }
    });
    
    let tb = document.querySelector('#tablaClienteProductos tbody'); tb.innerHTML='';
    let keysPrd = Object.keys(prds).sort((a,b)=>(prds[b].u+prds[b].c)-(prds[a].u+prds[a].c));
    if(keysPrd.length===0) { tb.innerHTML=`<tr><td colspan="2" style="text-align:center; color:#999;">Sin mix de productos comprado.</td></tr>`; }
    else { keysPrd.forEach(k=>{ let sumStr = prds[k].c>0 ? `${prds[k].c} cjs / ${prds[k].u} und` : `${prds[k].u} und`; tb.innerHTML+=`<tr><td>${k}</td><td class="num-col">${sumStr}</td></tr>`; }); }
}

// =========================================
// VENTANAS MODALES DINÁMICAS (INACTIVOS)
// =========================================
function mostrarModalInactivos(idVendedor) { 
    let tb = document.querySelector('#tablaInactivos tbody'); tb.innerHTML = '';
    let cColIdV = getColExacto(db.clientes[0], ['ID_VENDEDOR']);
    let cColEst = getColExacto(db.clientes[0], ['ESTADO DE VENTA', 'ESTADO']);
    let cColDoc = getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI']);
    let cColRaz = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE']);

    let listaInactivos = db.clientes.filter(c => {
        let est = normalizarTexto(c[cColEst]);
        let esInactivo = !est.includes('ACTIVO');
        if (idVendedor === 'GLOBAL') return esInactivo;
        return normalizarTexto(c[cColIdV]) === normalizarTexto(idVendedor) && esInactivo;
    });

    document.getElementById('modalInactivosTitulo').textContent = idVendedor === 'GLOBAL' ? "Clientes Inactivos Globales" : "Clientes Inactivos del Vendedor Asignado";

    if(listaInactivos.length === 0) {
        tb.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#777; padding:20px;">Felicidades, no cuenta con clientes inactivos en esta lista.</td></tr>`;
    } else {
        listaInactivos.forEach(c => {
            let est = c[cColEst] || 'INACTIVO';
            tb.innerHTML += `<tr><td>${c[cColDoc]||'---'}</td><td><b>${c[cColRaz]||'---'}</b></td><td><span class="badge badge-inactivo">${est}</span></td></tr>`;
        });
    }
    document.getElementById('modalInactivos').style.display = 'flex'; 
}

function cerrarModalInactivos() { 
    document.getElementById('modalInactivos').style.display = 'none'; 
}
