const urls = {
    vendedores: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=0&single=true&output=csv',
    ventas: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=588620531&single=true&output=csv',
    productos: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1241891503&single=true&output=csv',
    clientes: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ70FuTF7cerHOQSNXrIcLFDFRprfHAV728CeKLsmNZdlxq3rA_SunZ6ILxYFtZVHVfQdphUycfNbUC/pub?gid=1344644608&single=true&output=csv'
};

let db = { vendedores: [], ventas: [], productos: [], clientes: [] };
let charts = {}; // Almacenamiento seguro de instancias de Chart.js

function destroyChart(id) {
    if (charts[id]) {
        charts[id].destroy();
        charts[id] = null;
    }
}

// =========================================
// UTILIDADES NORMALIZADORAS Y PARSEOS
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
// INICIALIZACIÓN Y CONTROL DE ACCESO
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
        const [resVend, resVent, resProd, resCli] = await Promise.all([
            cargarCSV(urls.vendedores), cargarCSV(urls.ventas), cargarCSV(urls.productos), cargarCSV(urls.clientes)
        ]);
        db.vendedores = resVend; db.ventas = resVent; db.productos = resProd; db.clientes = resCli;
        
        generarMenuVendedores();
        cambiarModulo('general', document.querySelector('.modulos-list li'));
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('appContainer').style.visibility = 'visible';
    } catch (e) { 
        document.getElementById('loadingTitle').textContent = "Error de Sincronización en Red"; 
        document.getElementById('loadingTitle').style.color = '#d93025'; 
    }
}

// =========================================
// CONTROLADOR DE PESTAÑAS PRINCIPAL (UNIFICADO)
// =========================================
function cambiarModulo(modulo, elemento) {
    document.querySelectorAll('.modulos-list li').forEach(el => el.classList.remove('active'));
    if(elemento) elemento.classList.add('active');
    
    document.querySelectorAll('.modulo-view').forEach(el => el.style.display = 'none');
    document.getElementById('menuVendedoresContainer').style.display = (modulo === 'productividad') ? 'flex' : 'none';
    
    if (modulo === 'general') {
        document.getElementById('vistaGeneral').style.display = 'block';
        document.getElementById('tituloDashboard').textContent = 'Vista General Comercial';
        cargarDataGeneral();
    } else if (modulo === 'productividad') {
        document.getElementById('vistaProductividad').style.display = 'block';
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
// INFRAESTRUCTURA MAPEO GEOGRÁFICO AVANZADO
// =========================================
function inyectarMapaNacional(idContenedorPadre, arrayCliData) {
    let padre = document.getElementById(idContenedorPadre);
    if(!padre) return;
    padre.innerHTML = '';
    
    let nDiv = document.createElement('div');
    nDiv.id = idContenedorPadre + '_interno';
    nDiv.style.width = '100%'; nDiv.style.height = '100%'; nDiv.style.borderRadius = '8px'; nDiv.style.zIndex = '1';
    padre.appendChild(nDiv);

    let map = L.map(nDiv.id).setView([-9.1899, -75.0151], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: 'Dialex' }).addTo(map);

    let cId = getColExacto(db.clientes[0], ['ID_CLIENTE']); let cRz = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE']); let cUb = getColExacto(db.clientes[0], ['UBICACIÓN', 'DIRECCION', 'DISTRITO']);
    let vId = getColExacto(db.ventas[0], ['ID_CLIENTE']); let vPr = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    
    let mapVentas = {}; 
    db.ventas.forEach(v => { let i = normalizarTexto(v[vId]); if(i) mapVentas[i] = (mapVentas[i]||0) + parseNum(v[vPr]); });

    // Diccionario Geográfico de Cobertura Ampliado
    const dicZonas = {
        'AREQUIPA':[-16.4090,-71.5375], 'CUSCO':[-13.5320,-71.9675], 'TRUJILLO':[-8.1160,-79.0300], 'CHICLAYO':[-6.7714,-79.8406], 
        'PIURA':[-5.1945,-80.6328], 'IQUITOS':[-3.7437,-73.2516], 'HUANCAYO':[-12.0651,-75.2049], 'TACNA':[-18.0146,-70.2536], 
        'CAJAMARCA':[-7.1638,-78.5156], 'PUNO':[-15.8422,-70.0199], 'AYACUCHO':[-13.1588,-74.2239], 'HUANUCO':[-9.9306,-76.2422], 
        'TARAPOTO':[-6.4864,-76.3644], 'PUCALLPA':[-8.3791,-74.5539], 'ICA':[-14.0678,-75.7286], 'CHIMBOTE':[-9.0853,-78.5783],
        'HUACHO':[-11.1064,-77.6050], 'CHINCHA':[-13.4161,-76.1325], 'CALLAO':[-12.0566,-77.1284], 'LURIGANCHO':[-11.9767,-76.9911], 
        'ATE':[-12.0266,-76.9178], 'PUENTE PIEDRA':[-11.8670,-77.0772], 'COMAS':[-11.9344,-77.0425], 'SURCO':[-12.1300,-76.9900], 
        'MIRAFLORES':[-12.1100,-77.0300], 'SAN ISIDRO':[-12.0950,-77.0320], 'SAN MARTIN':[-11.9982,-77.0594], 'LOS OLIVOS':[-11.9687,-77.0691], 
        'SAN JUAN DE LURIGANCHO':[-11.9619,-76.9981], 'LIMA':[-12.0464,-77.0428]
    };

    let marcadores = L.featureGroup();

    arrayCliData.forEach(c => {
        let id = normalizarTexto(c[cId]); let raz = c[cRz]||'Cliente Desconocido'; let ubi = normalizarTexto(c[cUb]); let vnt = mapVentas[id]||0;
        let coord = dicZonas['LIMA'];
        for(let z in dicZonas) { if(ubi.includes(z)) { coord = dicZonas[z]; break; } }
        
        let rad = Math.random() * 0.03; let ang = Math.random() * Math.PI * 2;
        let lat = coord[0] + (Math.sin(ang) * rad); let lng = coord[1] + (Math.cos(ang) * rad);

        let color = vnt > 0 ? '#34a853' : '#ea4335';
        let markHtml = `<div style="background-color:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`;
        let icon = L.divIcon({ html: markHtml, className: 'custom-pin', iconSize: [14,14] });

        let m = L.marker([lat, lng], {icon: icon}).bindPopup(`<b>${raz}</b><br>Compra Total: S/ ${vnt.toLocaleString()}<br><small>${c[cUb]||''}</small>`);
        marcadores.addLayer(m);
    });
    
    marcadores.addTo(map);
    if(arrayCliData.length > 0) map.fitBounds(marcadores.getBounds(), {padding: [20, 20], maxZoom: 12});
    setTimeout(() => { map.invalidateSize(); }, 300);
}

// =========================================
// RENDERS DE SECCIONES (MATEMÁTICA Y CHARTS)
// =========================================
function cargarDataGeneral() {
    let vColM = getColExacto(db.vendedores[0], ['META']); let vColIdV = getColExacto(db.vendedores[0], ['ID_VENDEDOR']); let vColT = getColExacto(db.vendedores[0], ['TIPO']);
    let vtColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']); let vtColIdV = getColExacto(db.ventas[0], ['ID_VENDEDOR']); let vtColF = getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']);
    
    let metaT = db.vendedores.reduce((s, v) => s + parseNum(v[vColM]), 0);
    let vtaT = db.ventas.reduce((s, v) => s + parseNum(v[vtColP]), 0);
    
    document.getElementById('kpiGeneral').innerHTML = `
        <div class="kpi-box destacado"><h4>Venta Total Corporativa</h4><span>${formatearMoneda(vtaT)}</span></div>
        <div class="kpi-box"><h4>Meta General Asignada</h4><span style="color:#333">${formatearMoneda(metaT)}</span></div>
        <div class="kpi-box"><h4>Clientes Totales</h4><span style="color:#333">${new Set(db.clientes.map(c => c[getColExacto(db.clientes[0],['ID_CLIENTE'])])).size}</span></div>`;

    destroyChart('chartVelocimetroGeneral');
    const pctG = metaT > 0 ? (vtaT / metaT) * 100 : 0;
    document.getElementById('textoVelocimetroGeneral').textContent = pctG.toFixed(1) + '%';
    charts['chartVelocimetroGeneral'] = new Chart(document.getElementById('chartVelocimetroGeneral').getContext('2d'), { 
        type:'doughnut', data:{datasets:[{data:[vtaT, Math.max(0,metaT-vtaT)], backgroundColor:['#34a853','#ddd'], borderWidth:0}]}, options:{responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, cutout:'75%', plugins:{legend:{display:false}}} 
    });

    let can = {'CALL CENTER':0, 'COBERTURA':0};
    db.ventas.forEach(v => {
        let vend = db.vendedores.find(vd => normalizarTexto(vd[vColIdV]) === normalizarTexto(v[vtColIdV]));
        let t = vend && vend[vColT] ? normalizarTexto(vend[vColT]) : '';
        if(t.includes('CALL')) can['CALL CENTER']+=parseNum(v[vtColP]); else can['COBERTURA']+=parseNum(v[vtColP]);
    });
    
    destroyChart('chartDonaGeneral');
    charts['chartDonaGeneral'] = new Chart(document.getElementById('chartDonaGeneral').getContext('2d'), { 
        type:'pie', data:{labels:['Call Center','Cobertura'], datasets:[{data:[can['CALL CENTER'],can['COBERTURA']], backgroundColor:['#4285f4','#ea4335']}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}} 
    });

    let daily={}; 
    db.ventas.forEach(v=>{ 
        let fObj = parseFechaEstricta(v[vtColF]); 
        if(fObj){ daily[fObj.string] = { val: (daily[fObj.string]?.val || 0) + parseNum(v[vtColP]), sort: fObj.sortValue }; } 
    });
    let arrFechas = Object.keys(daily).map(k => ({ label: k, ...daily[k] })).sort((a,b)=>a.sort-b.sort);
    
    destroyChart('chartLineaGeneral');
    charts['chartLineaGeneral'] = new Chart(document.getElementById('chartLineaGeneral').getContext('2d'), { 
        type:'line', data:{labels:arrFechas.map(f=>f.label), datasets:[{label:'Ventas Diarias', data:arrFechas.map(f=>f.val), borderColor:'#4285f4', backgroundColor:'rgba(66, 133, 244, 0.1)', fill:true, tension:0.1}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}} 
    });

    let rank = db.vendedores.filter(v=>parseNum(v[vColM])>0).map(v=>{
        let tot = db.ventas.filter(vt=>normalizarTexto(vt[vtColIdV])===normalizarTexto(v[vColIdV])).reduce((s,vt)=>s+parseNum(vt[vtColP]),0);
        return {n:v[getColExacto(v,['NOMBRE'])], p:(tot/parseNum(v[vColM]))*100};
    }).sort((a,b)=>b.p-a.p);
    
    destroyChart('chartRankingMeta');
    charts['chartRankingMeta'] = new Chart(document.getElementById('chartRankingMeta').getContext('2d'), { 
        type:'bar', data:{labels:rank.map(r=>r.n), datasets:[{label:'% Avance', data:rank.map(r=>Math.min(r.p,120)), backgroundColor:'#34a853'}]}, options:{responsive:true, maintainAspectRatio:false} 
    });

    inyectarMapaNacional('ContenedorMapaGeneral', db.clientes);
}

function cargarDataVendedor(vdData) {
    document.getElementById('estadoVendedorSeleccion').style.display = 'none';
    document.getElementById('contenidoProductividad').style.display = 'block';
    
    let idV = normalizarTexto(vdData[getColExacto(vdData, ['ID_VENDEDOR'])]);
    let m = parseNum(vdData[getColExacto(vdData, ['META'])]);
    let vtColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']);
    let sVt = db.ventas.filter(v=>normalizarTexto(v[getColExacto(v,['ID_VENDEDOR'])])===idV);
    let totV = sVt.reduce((s,v)=>s+parseNum(v[vtColP]),0);
    let sCli = db.clientes.filter(c=>normalizarTexto(c[getColExacto(c,['ID_VENDEDOR'])])===idV);

    document.getElementById('kpiVendedor').innerHTML = `
        <div class="kpi-box destacado"><h4>Logrado Soles</h4><span>${formatearMoneda(totV)}</span></div>
        <div class="kpi-box"><h4>Cuota Comercial</h4><span>${formatearMoneda(m)}</span></div>
        <div class="kpi-box kpi-clickable" style="cursor:pointer;" onclick="mostrarModalInactivos('${idV}')"><h4>Cartera Clientes 🔍</h4><span>${sCli.length} Cli</span></div>`;

    destroyChart('chartVelocimetroVendedor');
    const pctV = m > 0 ? (totV / m) * 100 : 0;
    document.getElementById('textoVelocimetroVendedor').textContent = pctV.toFixed(1) + '%';
    charts['chartVelocimetroVendedor'] = new Chart(document.getElementById('chartVelocimetroVendedor').getContext('2d'), { 
        type:'doughnut', data:{datasets:[{data:[totV, Math.max(0,m-totV)], backgroundColor:['#4285f4','#ddd'], borderWidth:0}]}, options:{responsive:true, maintainAspectRatio:false, rotation:-90, circumference:180, cutout:'75%', plugins:{legend:{display:false}}} 
    });

    destroyChart('chartDonaVendedor');
    charts['chartDonaVendedor'] = new Chart(document.getElementById('chartDonaVendedor').getContext('2d'), { 
        type:'pie', data:{labels:['Logrado','Restante'], datasets:[{data:[totV, Math.max(0,m-totV)], backgroundColor:['#34a853','#ea4335']}]}, options:{responsive:true, maintainAspectRatio:false} 
    });

    let pCId = getColExacto(db.productos[0], ['ID_VENDEDOR']); let pCNom = getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']);
    let cU={}; let cC={};
    db.productos.filter(p=>normalizarTexto(p[pCId])===idV).forEach(p=>{
        let n=p[pCNom]; let u=parseNum(p[getColExacto(p,['CANTIDAD UNID','UNID'])]); let c=parseNum(p[getColExacto(p,['CANTIDAD CAJA','CAJA'])]);
        if(n){ if(u>0) cU[n]=(cU[n]||0)+u; if(c>0) cC[n]=(cC[n]||0)+c; }
    });
    
    const fillTb = (id, obj) => { 
        let tb=document.querySelector(`#${id} tbody`); tb.innerHTML=''; 
        let keys = Object.keys(obj).sort((a,b)=>obj[b]-obj[a]).slice(0,5); 
        if(keys.length===0){ tb.innerHTML=`<tr><td colspan="2" style="text-align:center;">Sin Registros</td></tr>`; } 
        else { keys.forEach(k=>tb.innerHTML+=`<tr><td>${k}</td><td class="num-col" style="text-align:right;">${obj[k].toLocaleString()}</td></tr>`); } 
    };
    fillTb('tablaProdUnid', cU); fillTb('tablaProdCaja', cC);

    inyectarMapaNacional('ContenedorMapaVendedor', sCli);
}

function cargarDataSituacion() {
    let vtColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']); let vtColR = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON']);
    let vT = db.ventas.reduce((s,v)=>s+parseNum(v[vtColP]),0); let lV = db.ventas.length;
    
    document.getElementById('kpiTicketPromedio').textContent = formatearMoneda(lV>0?vT/lV:0);
    let cC={}; db.ventas.forEach(v=>{ let r=normalizarTexto(v[vtColR]); if(r) cC[r]=(cC[r]||0)+parseNum(v[vtColP]); });
    document.getElementById('kpiFrecuencia').textContent = Object.keys(cC).length>0 ? (lV/Object.keys(cC).length).toFixed(1) : 0;

    let cColR = getColExacto(db.clientes[0], ['RAZÓN SOCIAL']); let cColE = getColExacto(db.clientes[0], ['ESTADO DE VENTA']);
    let rsg=0; let clAct = [];
    db.clientes.forEach(c=>{ if(normalizarTexto(c[cColE]).includes('ACTIVO')){ clAct.push(c); if(!cC[normalizarTexto(c[cColR])]) rsg++; } });
    document.getElementById('kpiRiesgo').textContent = rsg;

    let arr = Object.keys(cC).map(k=>({n:k, t:cC[k]})).sort((a,b)=>b.t-a.t);
    let tb = document.querySelector('#tablaABC tbody'); 
    
    // RENDERIZADO RÁPIDO PRE-COMPILADO (Previene congelamiento de pantalla)
    let rowsHtml = ''; let sAc=0;
    arr.forEach(c=>{ 
        sAc+=c.t; let pct=(sAc/vT)*100; 
        let sg=pct<=80?'A (Top)':'B (Medio)'; if(pct>95) sg='C (Bajo)';
        let cs=pct<=80?'badge-a':'badge-b'; if(pct>95) cs='badge-c';
        rowsHtml+=`<tr><td>${c.n}</td><td><span class="badge ${cs}">${sg}</span></td><td class="num-col" style="text-align:right;">${formatearMoneda(c.t)}</td></tr>`; 
    });
    tb.innerHTML = rowsHtml;

    inyectarMapaNacional('ContenedorMapaSituacion', clAct);
}

// =========================================
// BÚSQUEDA AVANZADA CON DOCUMENT FRAGMENT
// =========================================
function llenarTablaDirectorio() {
    let tb = document.querySelector('#tablaDirectorioClientes tbody'); tb.innerHTML='';
    let docC = getColExacto(db.clientes[0], ['Documento_Numero', 'RUC', 'DNI']); let razC = getColExacto(db.clientes[0], ['RAZÓN SOCIAL', 'NOMBRE']);
    
    // Inserción masiva ultra veloz mediante Fragmento de Memoria nativo
    let fragmento = document.createDocumentFragment();
    db.clientes.forEach(c=>{
        let d = c[docC]||''; let r = c[razC]||'';
        if(d || r) {
            let tr = document.createElement('tr'); tr.className = 'fila-cliente';
            tr.innerHTML = `<td>${d}</td><td>${r}</td>`;
            tr.onclick = () => mostrarDetalleCliente(d, r, tr);
            fragmento.appendChild(tr);
        }
    });
    tb.appendChild(fragmento);
}

function filtrarDirectorioClientes() {
    let input = normalizarTexto(document.getElementById("inputBusquedaCliente").value);
    let filas = document.querySelectorAll('#tablaDirectorioClientes tbody tr');
    for (let i = 0; i < filas.length; i++) {
        filas[i].style.display = normalizarTexto(filas[i].textContent).includes(input) ? "" : "none";
    }
}

function mostrarDetalleCliente(doc, razon, trActivo) {
    document.querySelectorAll('.fila-cliente').forEach(f => f.classList.remove('activa'));
    if(trActivo) trActivo.classList.add('activa');
    
    let panel = document.getElementById('panelDetalleCliente');
    panel.style.display = 'block';
    if (window.innerWidth <= 1024) { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    
    document.getElementById('detalleNombreCliente').textContent = razon || 'Desconocido';
    document.getElementById('detalleDocCliente').textContent = doc || 'Sin Documento';

    let vColR = getColExacto(db.ventas[0], ['RAZÓN SOCIAL', 'RAZON']); let vColD = getColExacto(db.ventas[0], ['Documento_Numero', 'RUC']); let vColP = getColExacto(db.ventas[0], ['PRECIO TOTAL', 'TOTAL']); let vColF = getColExacto(db.ventas[0], ['FECHA DE VENTA', 'FECHA']);
    
    let susVtas = db.ventas.filter(v => (normalizarTexto(v[vColR])===normalizarTexto(razon) && razon) || (v[vColD]===doc && doc));
    document.getElementById('detalleTotalVenta').textContent = formatearMoneda(susVtas.reduce((s,v)=>s+parseNum(v[vColP]),0));
    
    let dbCli = db.clientes.find(c => normalizarTexto(c[getColExacto(c,['RAZÓN SOCIAL', 'NOMBRE'])]) === normalizarTexto(razon));
    let estado = dbCli ? normalizarTexto(dbCli[getColExacto(dbCli,['ESTADO DE VENTA', 'ESTADO'])]) : 'INACTIVO';
    document.getElementById('detalleEstadoCli').innerHTML = `<span class="badge ${estado.includes('ACTIVO')?'badge-activo':'badge-inactivo'}">${estado}</span>`;

    let hist={}; 
    susVtas.forEach(v=>{ let fObj = parseFechaEstricta(v[vColF]); if(fObj){ hist[fObj.string] = { val: (hist[fObj.string]?.val || 0) + parseNum(v[vColP]), sort: fObj.sortValue }; } });
    let hArr = Object.keys(hist).map(k => ({ label: k, ...hist[k] })).sort((a,b)=>a.sort-b.sort);

    destroyChart('chartClienteHistorial');
    charts['chartClienteHistorial'] = new Chart(document.getElementById('chartClienteHistorial').getContext('2d'), { 
        type:'bar', data:{labels:hArr.map(f=>f.label), datasets:[{label:'Monto S/', data:hArr.map(f=>f.val), backgroundColor:'#34a853', borderRadius:4}]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}} 
    });

    let pColR = getColExacto(db.productos[0], ['RAZÓN SOCIAL', 'RAZON']); let pColD = getColExacto(db.productos[0], ['Documento_Numero', 'RUC']); let pColN = getColExacto(db.productos[0], ['NOMBRE DEL PRODUCTO', 'PRODUCTO']); let pColC = getColExacto(db.productos[0], ['CANTIDAD CAJA', 'CAJA']); let pColU = getColExacto(db.productos[0], ['CANTIDAD UNID', 'UNID']);
    let prds={}; db.productos.filter(p=>(normalizarTexto(p[pColR])===normalizarTexto(razon) && razon)||(p[pColD]===doc && doc)).forEach(p=>{
        let n=p[pColN]; let u=parseNum(p[pColU]); let c=parseNum(p[pColC]);
        if(n){ if(!prds[n]) prds[n]={u:0,c:0}; prds[n].u+=u; prds[n].c+=c; }
    });
    
    let tb = document.querySelector('#tablaClienteProductos tbody'); tb.innerHTML='';
    let keysPrd = Object.keys(prds).sort((a,b)=>(prds[b].u+prds[b].c)-(prds[a].u+prds[a].c));
    if(keysPrd.length===0) { tb.innerHTML=`<tr><td colspan="2" style="text-align:center">Sin mix de productos en BD</td></tr>`; }
    else { keysPrd.forEach(k=>{ let sumStr = prds[k].c>0 ? `${prds[k].c} cjs` : `${prds[k].u} und`; tb.innerHTML+=`<tr><td>${k}</td><td class="num-col" style="text-align:right;">${sumStr}</td></tr>`; }); }
}

function mostrarModalInactivos(idVendedor) { 
    let tb = document.querySelector('#tablaInactivos tbody'); tb.innerHTML = '';
    let html = '';
    db.clientes.filter(c => normalizarTexto(c[getColExacto(c,['ID_VENDEDOR'])]) === normalizarTexto(idVendedor)).forEach(c => {
        let est = normalizarTexto(c[getColExacto(c,['ESTADO DE VENTA'])]);
        html += `<tr><td>${c[getColExacto(c,['Documento_Numero'])]||''}</td><td>${c[getColExacto(c,['RAZÓN SOCIAL'])]||''}</td><td><span class="badge ${est.includes('ACTIVO')?'badge-activo':'badge-inactivo'}">${est}</span></td></tr>`;
    });
    tb.innerHTML = html;
    document.getElementById('modalInactivos').style.display = 'flex'; 
}
function cerrarModalInactivos() { document.getElementById('modalInactivos').style.display = 'none'; }
