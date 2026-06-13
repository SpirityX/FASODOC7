/* ============================================================
   FasoDoc — App logic (Firebase Realtime Database)
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getDatabase, ref, onValue, runTransaction, push
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-database.js";
import { ICONS, iconSvg, mountIcons, esc, LEVELS } from "./shared.js";

/* ---------- Firebase setup ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyCN06ZZbSnm9BWVpZ14GzB3aWkvsYhlI2s",
  authDomain: "fasodoc-c6171.firebaseapp.com",
  databaseURL: "https://fasodoc-c6171-default-rtdb.firebaseio.com",
  projectId: "fasodoc-c6171",
  storageBucket: "fasodoc-c6171.firebasestorage.app",
  messagingSenderId: "828641018562",
  appId: "1:828641018562:web:a76ca4620ce76d8633b15b"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);


/* ---------- Persistent state ---------- */
const Store = {
  get(key, fallback){
    try{ const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch(e){ return fallback; }
  },
  set(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){}
  }
};

let favorites = new Set(Store.get('fasodoc-favorites', []));
let viewed = new Set(Store.get('fasodoc-viewed', []));
let theme = Store.get('fasodoc-theme', 'light');
let fontSize = Store.get('fasodoc-fontsize', 'normal');
let lastVisit = Store.get('fasodoc-lastvisit', null);
if(lastVisit === null){ lastVisit = Date.now(); Store.set('fasodoc-lastvisit', lastVisit); }

function saveFavorites(){ Store.set('fasodoc-favorites', [...favorites]); }
function saveViewed(){ Store.set('fasodoc-viewed', [...viewed]); }

/* ---------- App data state ---------- */
const state = {
  categories: [],
  categoriesById: {},
  categoriesLoaded: false,
  documents: [],
  documentsLoaded: false
};

/* ---------- Helpers ---------- */
function fmtNumber(n){
  if(n >= 1000) return (n/1000).toFixed(n % 1000 === 0 ? 0 : 1).replace('.', ',') + 'k';
  return String(n);
}
function fmtDate(ts){
  if(!ts) return '';
  return new Date(ts).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
}
function snapshotToArray(snap){
  const out = [];
  snap.forEach(child => out.push({ id: child.key, ...child.val() }));
  return out;
}
function categoryFor(doc){
  return state.categoriesById[doc.categoryId];
}
function iconForCategory(cat){
  return (cat && ICONS[cat.icon]) ? cat.icon : 'book';
}

/* ---------- Doc card rendering ---------- */
function docCardHTML(doc, opts={}){
  const cat = categoryFor(doc);
  const icon = iconForCategory(cat);
  const catName = cat ? cat.name : 'Document';
  const isFav = favorites.has(doc.id);
  const delay = opts.delay ? `animation-delay:${opts.delay}ms;` : '';
  return `
  <article class="doc-card ripple" data-doc-id="${doc.id}" style="${delay}">
    <div class="doc-thumb" data-icon="${icon}" aria-hidden="true"></div>
    <div class="doc-body">
      <h3 class="doc-title">${esc(doc.title)}</h3>
      <p class="doc-meta">${esc(catName)} · ${esc(doc.level || '')} · ${doc.year ?? ''}</p>
      ${opts.showDesc !== false ? `<p class="doc-desc">${esc(doc.description)}</p>` : ''}
      <div class="doc-tags">
        <span class="badge">${esc(catName)}</span>
        <span class="doc-stat"><span data-icon="eye" aria-hidden="true"></span>${fmtNumber(doc.views || 0)}</span>
      </div>
      <div class="doc-footer">
        <button class="btn-open ripple" type="button" data-open-detail="${doc.id}">
          <span data-icon="book-open" aria-hidden="true"></span> Ouvrir
        </button>
        <button class="fav-btn ripple ${isFav ? 'is-fav' : ''}" type="button" data-fav-toggle="${doc.id}" aria-pressed="${isFav}" aria-label="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'} : ${esc(doc.title)}" data-icon="heart"></button>
      </div>
    </div>
  </article>`;
}

function skeletonHTML(){
  return `
  <div class="skeleton" aria-hidden="true">
    <div class="skeleton-thumb"></div>
    <div class="skeleton-lines">
      <div class="skeleton-line w60"></div>
      <div class="skeleton-line w40"></div>
      <div class="skeleton-line w80"></div>
    </div>
  </div>`;
}
function renderSkeletons(container, count){
  container.innerHTML = Array.from({length:count}).map(skeletonHTML).join('');
}
function renderDocList(container, docs, opts={}){
  if(!docs.length){ container.innerHTML = ''; return false; }
  container.innerHTML = docs.map((d,i)=> docCardHTML(d, { ...opts, delay: Math.min(i*45,300) })).join('');
  mountIcons(container);
  return true;
}

/* ---------- Category cards ---------- */
function categoryCardHTML(cat, full){
  const count = state.documents.filter(d=>d.categoryId===cat.id).length;
  const icon = iconForCategory(cat);
  if(full){
    return `
    <button class="cat-card ripple" type="button" data-category="${cat.id}">
      <span class="cat-card-icon" data-icon="${icon}" aria-hidden="true"></span>
      <span class="cat-card-text">
        <span class="cat-card-name">${esc(cat.name)}</span>
        <span class="cat-card-count">${count} document${count===1?'':'s'}</span>
      </span>
      <span class="cat-card-chevron" data-icon="chevron-right" aria-hidden="true"></span>
    </button>`;
  }
  return `
  <button class="cat-card ripple" type="button" data-category="${cat.id}">
    <span class="cat-card-icon" data-icon="${icon}" aria-hidden="true"></span>
    <span class="cat-card-name">${esc(cat.name)}</span>
  </button>`;
}
function categorySkeletonHTML(full){
  return full
    ? `<div class="skeleton" aria-hidden="true" style="border-radius:var(--r-md)"><div class="skeleton-thumb" style="width:44px;height:44px;border-radius:var(--r-sm)"></div><div class="skeleton-lines"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div></div>`
    : `<div class="skeleton" aria-hidden="true" style="flex-direction:column;align-items:center;gap:8px;padding:0.875rem 0.625rem;border-radius:var(--r-md)"><div class="skeleton-thumb" style="width:40px;height:40px;border-radius:var(--r-sm)"></div><div class="skeleton-line w60" style="width:80%"></div></div>`;
}
function renderCategories(container, list, full){
  container.innerHTML = list.map(c=>categoryCardHTML(c, full)).join('');
  mountIcons(container);
}

/* ---------- Navigation ---------- */
const TOP_PAGES = ['home','search','categories','favorites','profile'];
let navStack = ['home'];
let currentPage = 'home';

function showPage(id, direction){
  document.querySelectorAll('.page').forEach(p=>{
    p.classList.remove('active','page--enter-right','page--enter-left');
  });
  const target = document.getElementById('page-'+id);
  if(direction === 'right') target.classList.add('page--enter-right');
  if(direction === 'left') target.classList.add('page--enter-left');
  target.classList.add('active');
  window.scrollTo(0,0);
}
function triggerPageLoader(){
  const loader = document.getElementById('pageLoader');
  loader.classList.remove('active');
  void loader.offsetWidth;
  loader.classList.add('active');
  clearTimeout(triggerPageLoader._t);
  triggerPageLoader._t = setTimeout(()=>loader.classList.remove('active'), 480);
}
function updateBottomNav(id){
  document.querySelectorAll('.nav-item').forEach(btn=>{
    const active = btn.dataset.goto === id;
    btn.classList.toggle('active', active);
    if(active) btn.setAttribute('aria-current','page'); else btn.removeAttribute('aria-current');
  });
}
function goTo(id, opts={}){
  if(id === currentPage && !opts.force) return;
  triggerPageLoader();
  const direction = opts.direction || (TOP_PAGES.includes(id) ? null : 'right');
  showPage(id, direction);
  if(TOP_PAGES.includes(id)){
    navStack = [id];
    updateBottomNav(id);
  } else {
    navStack.push(id);
  }
  currentPage = id;
  onPageShown(id, opts);
}
function goBack(){
  if(navStack.length > 1){
    navStack.pop();
    const prev = navStack[navStack.length-1];
    triggerPageLoader();
    showPage(prev, 'left');
    currentPage = prev;
    if(TOP_PAGES.includes(prev)) updateBottomNav(prev);
    onPageShown(prev, {});
  } else {
    goTo('home');
  }
}
function onPageShown(id, opts){
  if(id === 'search'){
    if(opts.resetFilters){ searchQuery=''; filters={category:[],level:[],subject:[],year:[]}; }
    if(opts.sort) sortMode = opts.sort;
    if(opts.categoryId){ filters.category = [opts.categoryId]; }
    if(opts.focusSearch){ setTimeout(()=>document.getElementById('search-input').focus(), 380); }
    renderSearch();
  }
  if(id === 'categories') renderAllCategories();
  if(id === 'favorites') renderFavorites();
  if(id === 'profile') updateProfileStats();
}

/* ---------- Home rendering ---------- */
function renderHomeCategories(){
  const grid = document.getElementById('home-categories');
  const empty = document.getElementById('home-categories-empty');
  if(!state.categoriesLoaded){
    grid.innerHTML = Array.from({length:8}).map(()=>categorySkeletonHTML(false)).join('');
    empty.hidden = true;
    return;
  }
  if(!state.categories.length){
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  renderCategories(grid, state.categories.slice(0,8), false);
}
function renderHomeDocLists(){
  const popular = document.getElementById('popular-docs');
  const popularEmpty = document.getElementById('popular-empty');
  const recent = document.getElementById('recent-docs');
  const recentEmpty = document.getElementById('recent-empty');

  if(!state.documentsLoaded){
    renderSkeletons(popular, 3);
    renderSkeletons(recent, 3);
    popularEmpty.hidden = true; recentEmpty.hidden = true;
    return;
  }
  const popularDocs = [...state.documents].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,5);
  const recentDocs = [...state.documents].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,5);

  const hasPopular = renderDocList(popular, popularDocs, { showDesc:false });
  popularEmpty.hidden = hasPopular;
  const hasRecent = renderDocList(recent, recentDocs, { showDesc:false });
  recentEmpty.hidden = hasRecent;
}
function renderAllCategories(){
  const grid = document.getElementById('all-categories');
  const empty = document.getElementById('categories-empty');
  const q = document.getElementById('category-search').value.trim().toLowerCase();
  if(!state.categoriesLoaded){
    grid.innerHTML = Array.from({length:6}).map(()=>categorySkeletonHTML(true)).join('');
    empty.hidden = true;
    return;
  }
  if(state.categories.length === 0){
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  let list = state.categories;
  if(q) list = list.filter(c=>(c.name||'').toLowerCase().includes(q));
  if(!list.length){
    grid.innerHTML = `<p class="empty-line">Aucune catégorie ne correspond à « ${esc(q)} ».</p>`;
    return;
  }
  renderCategories(grid, list, true);
}

/* ---------- Search & filters ---------- */
let searchQuery = '';
let sortMode = 'recent'; // 'recent' | 'popular'
let filters = { category: [], level: [], subject: [], year: [] };
const FILTER_LABELS = { category: 'Catégorie', level: 'Niveau', subject: 'Matière', year: 'Année' };

function filterOptions(type){
  if(type === 'category') return state.categories.map(c=>({ value:c.id, label:c.name }));
  if(type === 'level'){
    const present = [...new Set(state.documents.map(d=>d.level).filter(Boolean))];
    return present.sort((a,b)=>{
      const ai = LEVELS.indexOf(a), bi = LEVELS.indexOf(b);
      if(ai !== -1 && bi !== -1) return ai - bi;
      if(ai !== -1) return -1;
      if(bi !== -1) return 1;
      return a.localeCompare(b);
    }).map(l=>({ value:l, label:l }));
  }
  if(type === 'subject'){
    const present = [...new Set(state.documents.map(d=>d.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    return present.map(s=>({ value:s, label:s }));
  }
  if(type === 'year'){
    const present = [...new Set(state.documents.map(d=>d.year).filter(Boolean))].sort((a,b)=>b-a);
    return present.map(y=>({ value:String(y), label:String(y) }));
  }
  return [];
}
function matchesFilters(doc){
  if(filters.category.length && !filters.category.includes(doc.categoryId)) return false;
  if(filters.level.length && !filters.level.includes(doc.level)) return false;
  if(filters.subject.length && !filters.subject.includes(doc.subject)) return false;
  if(filters.year.length && !filters.year.includes(String(doc.year))) return false;
  return true;
}
function matchesQuery(doc, q){
  if(!q) return true;
  const cat = categoryFor(doc);
  const hay = `${doc.title||''} ${doc.description||''} ${doc.subject||''} ${cat?cat.name:''} ${doc.level||''}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}
function getFilteredDocs(){
  let list = state.documents.filter(d=> matchesQuery(d, searchQuery) && matchesFilters(d));
  if(sortMode === 'popular') list = [...list].sort((a,b)=>(b.views||0)-(a.views||0));
  else list = [...list].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  return list;
}
function renderActiveFilterTags(){
  const wrap = document.getElementById('active-filters');
  let tags = [];
  Object.entries(filters).forEach(([type, values])=>{
    values.forEach(v=>{
      const opt = filterOptions(type).find(o=>o.value===v);
      const label = opt ? opt.label : v;
      tags.push(`<span class="tag-chip" data-remove-filter="${type}" data-value="${esc(v)}">${esc(label)}<button type="button" data-icon="x" aria-label="Retirer le filtre ${esc(label)}"></button></span>`);
    });
  });
  wrap.innerHTML = tags.join('');
  mountIcons(wrap);
}
function updateFilterChips(){
  document.querySelectorAll('.filter-chip').forEach(chip=>{
    const type = chip.dataset.filter;
    const count = filters[type].length;
    chip.classList.toggle('active', count > 0);
    chip.dataset.count = count;
    chip.setAttribute('aria-pressed', count > 0);
  });
}
function renderSearch(){
  if(!state.documentsLoaded){
    renderSkeletons(document.getElementById('search-results'), 4);
    document.getElementById('search-empty').hidden = true;
    document.getElementById('results-count').textContent = '';
    return;
  }
  const results = getFilteredDocs();
  const container = document.getElementById('search-results');
  const empty = document.getElementById('search-empty');
  const countEl = document.getElementById('results-count');

  document.getElementById('search-input').value = searchQuery;
  document.getElementById('search-clear').hidden = !searchQuery;

  const has = renderDocList(container, results);
  empty.hidden = has;
  container.style.display = has ? '' : 'none';
  countEl.textContent = results.length
    ? `${results.length} résultat${results.length>1?'s':''} trouvé${results.length>1?'s':''}`
    : (state.documents.length ? '' : 'Aucun document disponible pour le moment.');
  updateFilterChips();
  renderActiveFilterTags();
}

/* ---------- Filter sheet ---------- */
let activeSheetType = null;
let sheetSelection = [];
function openFilterSheet(type){
  activeSheetType = type;
  sheetSelection = [...filters[type]];
  document.getElementById('sheet-title').textContent = `Filtrer par ${FILTER_LABELS[type].toLowerCase()}`;
  const opts = filterOptions(type);
  const wrap = document.getElementById('sheet-options');
  if(!opts.length){
    wrap.innerHTML = `<p class="empty-line">Aucune option disponible pour le moment.</p>`;
  } else {
    wrap.innerHTML = opts.map(o=>`<button class="sheet-option ripple ${sheetSelection.includes(o.value)?'active':''}" type="button" data-value="${esc(o.value)}" aria-pressed="${sheetSelection.includes(o.value)}">${esc(o.label)}</button>`).join('');
  }
  document.getElementById('sheet-backdrop').classList.add('active');
  const sheet = document.getElementById('filter-sheet');
  sheet.hidden = false;
  requestAnimationFrame(()=>sheet.classList.add('active'));
}
function closeFilterSheet(){
  const sheet = document.getElementById('filter-sheet');
  document.getElementById('sheet-backdrop').classList.remove('active');
  sheet.classList.remove('active');
  setTimeout(()=>{ sheet.hidden = true; }, 350);
  activeSheetType = null;
}

/* ---------- Favorites ---------- */
function toggleFavorite(id, btn){
  if(favorites.has(id)){
    favorites.delete(id);
    if(btn){ btn.classList.remove('is-fav'); btn.setAttribute('aria-pressed','false'); }
    showToast('Retiré des favoris', 'heart');
  } else {
    favorites.add(id);
    if(btn){ btn.classList.add('is-fav'); btn.setAttribute('aria-pressed','true'); }
    showToast('Ajouté aux favoris', 'heart');
  }
  if(btn){
    btn.classList.remove('bump');
    void btn.offsetWidth;
    btn.classList.add('bump');
  }
  saveFavorites();
  if(currentPage === 'favorites') renderFavorites();
  if(currentPage === 'profile') updateProfileStats();
}
let favTab = 'all';
function renderFavorites(){
  const tabsWrap = document.getElementById('fav-tabs');
  const allFavDocs = [...favorites].map(id=>state.documents.find(d=>d.id===id)).filter(Boolean);
  const usedCatIds = [...new Set(allFavDocs.map(d=>d.categoryId).filter(Boolean))];
  const tabs = [{id:'all', name:'Tous'}, ...usedCatIds.map(id=>state.categoriesById[id]).filter(Boolean)];
  if(!tabs.find(t=>t.id===favTab)) favTab = 'all';
  tabsWrap.innerHTML = tabs.map(t=>`<button class="tab ripple ${t.id===favTab?'active':''}" type="button" role="tab" aria-selected="${t.id===favTab}" data-fav-tab="${t.id}">${esc(t.name)}</button>`).join('');
  mountIcons(tabsWrap);

  let docs = favTab === 'all' ? allFavDocs : allFavDocs.filter(d=>d.categoryId===favTab);
  docs.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  const container = document.getElementById('favorites-list');
  const empty = document.getElementById('favorites-empty');
  const has = renderDocList(container, docs);
  container.style.display = has ? '' : 'none';
  empty.hidden = allFavDocs.length > 0;
  tabsWrap.style.display = allFavDocs.length ? '' : 'none';
}

/* ---------- Firebase write helpers ---------- */
function bumpField(docId, field){
  runTransaction(ref(db, `documents/${docId}/${field}`), (current)=> (current||0) + 1).catch(()=>{});
}

/* ---------- Document detail ---------- */
function openDetail(id){
  const doc = state.documents.find(d=>d.id===id);
  if(!doc) return;
  if(!viewed.has(id)){
    viewed.add(id); saveViewed();
    bumpField(id, 'views');
  }

  const cat = categoryFor(doc);
  const icon = iconForCategory(cat);
  const catName = cat ? cat.name : 'Document';
  const isFav = favorites.has(doc.id);
  const content = document.getElementById('detail-content');
  content.dataset.docId = doc.id;
  content.innerHTML = `
    <div class="detail-hero">
      <div class="detail-thumb" data-icon="${icon}" aria-hidden="true"></div>
      <div>
        <h2 class="detail-title">${esc(doc.title)}</h2>
        <p class="detail-sub">${esc(catName)} · ${esc(doc.level || '')} · ${doc.year ?? ''}${doc.createdAt ? ' · Ajouté le ' + fmtDate(doc.createdAt) : ''}</p>
      </div>
    </div>

    <div class="detail-stats">
      <div class="detail-stat">
        <div class="detail-stat-icon" data-icon="eye" aria-hidden="true"></div>
        <div class="detail-stat-value" id="detail-stat-views">${fmtNumber(doc.views || 0)}</div>
        <div class="detail-stat-label">Vues</div>
      </div>
      <div class="detail-stat">
        <div class="detail-stat-icon" data-icon="download" aria-hidden="true"></div>
        <div class="detail-stat-value" id="detail-stat-downloads">${fmtNumber(doc.downloads || 0)}</div>
        <div class="detail-stat-label">Téléchargements</div>
      </div>
    </div>

    <div class="detail-section">
      <h3>Description</h3>
      <p class="detail-desc">${esc(doc.description)}</p>
    </div>

    <div class="detail-section">
      <h3>Informations</h3>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-row-label"><span data-icon="${icon}" aria-hidden="true"></span>Catégorie</span>
          <span class="info-row-value">${esc(catName)}</span>
        </div>
        <div class="info-row">
          <span class="info-row-label"><span data-icon="bar-chart" aria-hidden="true"></span>Niveau</span>
          <span class="info-row-value">${esc(doc.level || '—')}</span>
        </div>
        <div class="info-row">
          <span class="info-row-label"><span data-icon="book" aria-hidden="true"></span>Matière</span>
          <span class="info-row-value">${esc(doc.subject || '—')}</span>
        </div>
        <div class="info-row">
          <span class="info-row-label"><span data-icon="calendar" aria-hidden="true"></span>Année</span>
          <span class="info-row-value">${doc.year ?? '—'}</span>
        </div>
        <div class="info-row">
          <span class="info-row-label"><span data-icon="file-text" aria-hidden="true"></span>Type</span>
          <span class="info-row-value">${esc(doc.type || 'PDF')}</span>
        </div>
      </div>
    </div>

    <div class="detail-actions">
      <div class="detail-actions-row">
        <button class="btn btn--primary ripple" type="button" data-detail-action="read"${doc.link ? '' : ' disabled'}>
          <span data-icon="book-open" aria-hidden="true"></span> Lire en ligne
        </button>
        <button class="btn btn--outline ripple" type="button" data-detail-action="download"${doc.link ? '' : ' disabled'}>
          <span data-icon="download" aria-hidden="true"></span> Télécharger
        </button>
      </div>
      <button class="btn btn--fav ripple ${isFav?'is-fav':''}" type="button" data-detail-action="fav" aria-pressed="${isFav}">
        <span data-icon="heart" aria-hidden="true"></span> <span class="fav-label">${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}</span>
      </button>
    </div>
  `;
  mountIcons(content);
  goTo('detail', { direction:'right' });
}
function refreshDetailStats(docId){
  const content = document.getElementById('detail-content');
  if(content.dataset.docId !== docId) return;
  const doc = state.documents.find(d=>d.id===docId);
  if(!doc) return;
  const viewsEl = document.getElementById('detail-stat-views');
  const dlEl = document.getElementById('detail-stat-downloads');
  if(viewsEl) viewsEl.textContent = fmtNumber(doc.views || 0);
  if(dlEl) dlEl.textContent = fmtNumber(doc.downloads || 0);
}

/* ---------- Profile stats ---------- */
function updateProfileStats(){
  document.getElementById('stat-views').textContent = viewed.size;
  document.getElementById('stat-favs').textContent = favorites.size;
}

/* ---------- Theme & accessibility ---------- */
function applyTheme(){
  if(theme === 'dark') document.documentElement.setAttribute('data-theme','dark');
  else document.documentElement.removeAttribute('data-theme');

  const toggleBtn = document.getElementById('theme-toggle');
  toggleBtn.dataset.icon = theme === 'dark' ? 'sun' : 'moon';
  delete toggleBtn.dataset.iconMounted;
  toggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Désactiver le mode sombre' : 'Activer le mode sombre');

  const switchEl = document.getElementById('theme-switch');
  switchEl.setAttribute('aria-checked', theme === 'dark');
  mountIcons(document);
}
function toggleTheme(){
  theme = theme === 'dark' ? 'light' : 'dark';
  Store.set('fasodoc-theme', theme);
  applyTheme();
}
function applyFontSize(){
  document.documentElement.setAttribute('data-fontsize', fontSize);
  document.querySelectorAll('#font-size-group .segmented-btn').forEach(b=>{
    b.setAttribute('aria-checked', b.dataset.fontsize === fontSize);
  });
}
function setFontSize(size){
  fontSize = size;
  Store.set('fasodoc-fontsize', fontSize);
  applyFontSize();
}

/* ---------- Toast ---------- */
let toastTimer;
function showToast(message, icon='check-square', isError=false){
  const toast = document.getElementById('toast');
  toast.innerHTML = `<span data-icon="${icon}" aria-hidden="true"></span><span>${esc(message)}</span>`;
  if(isError) toast.style.setProperty('--toast-error','1');
  mountIcons(toast);
  toast.classList.add('active');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove('active'), 2600);
}

/* ---------- Ripple effect ---------- */
document.addEventListener('pointerdown', (e)=>{
  const el = e.target.closest('.ripple');
  if(!el) return;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.6;
  const circle = document.createElement('span');
  circle.className = 'ripple-circle';
  circle.style.width = circle.style.height = size + 'px';
  circle.style.left = (e.clientX - rect.left - size/2) + 'px';
  circle.style.top = (e.clientY - rect.top - size/2) + 'px';
  el.appendChild(circle);
  setTimeout(()=>circle.remove(), 600);
});

/* ---------- Notifications ---------- */
function updateNotifications(){
  const badge = document.getElementById('notif-badge');
  const count = state.documents.filter(d=>(d.createdAt||0) > lastVisit).length;
  if(count > 0){
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

/* ---------- Suggestion form ---------- */
function populateSuggestSelects(){
  const catSelect = document.getElementById('suggest-category');
  const current = catSelect.value;
  catSelect.innerHTML = `<option value="">Choisir…</option>` +
    state.categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if(current) catSelect.value = current;

  const levelSelect = document.getElementById('suggest-level');
  if(!levelSelect.options.length){
    levelSelect.innerHTML = `<option value="">Choisir…</option>` + LEVELS.map(l=>`<option value="${l}">${l}</option>`).join('');
  }
}
function initSuggestForm(){
  populateSuggestSelects();
  const form = document.getElementById('suggest-form');
  const submitBtn = document.getElementById('suggest-submit');
  const statusEl = document.getElementById('suggest-status');

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      title: (fd.get('title')||'').toString().trim(),
      description: (fd.get('description')||'').toString().trim(),
      categoryId: (fd.get('category')||'').toString(),
      level: (fd.get('level')||'').toString(),
      subject: (fd.get('subject')||'').toString().trim(),
      link: (fd.get('link')||'').toString().trim(),
      message: (fd.get('message')||'').toString().trim(),
      status: 'pending',
      suggestedAt: Date.now()
    };
    if(!data.title || !data.description || !data.categoryId || !data.level || !data.subject || !data.link){
      statusEl.textContent = 'Merci de remplir tous les champs obligatoires.';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-label').textContent = ' Envoi en cours…';
    statusEl.textContent = '';
    try{
      await push(ref(db, 'suggestions'), data);
      form.reset();
      showToast('Merci ! Ta suggestion a été envoyée.', 'send');
      setTimeout(()=>goBack(), 600);
    } catch(err){
      statusEl.textContent = "Une erreur est survenue. Vérifie ta connexion et réessaie.";
      showToast("Erreur lors de l'envoi", 'alert-circle', true);
    } finally {
      submitBtn.disabled = false;
      const label = submitBtn.querySelector('.btn-label');
      if(label) label.textContent = ' Envoyer la suggestion';
    }
  });
}

/* ---------- Global click delegation ---------- */
function initEvents(){
  document.addEventListener('click', (e)=>{
    const gotoEl = e.target.closest('[data-goto]');
    if(gotoEl){
      const opts = {};
      if(gotoEl.dataset.sort){ opts.sort = gotoEl.dataset.sort; opts.resetFilters = true; }
      if(gotoEl.hasAttribute('data-focus-search')) opts.focusSearch = true;
      goTo(gotoEl.dataset.goto, opts);
      return;
    }
    if(e.target.closest('[data-back]')){ goBack(); return; }

    const catCard = e.target.closest('.cat-card');
    if(catCard){
      sortMode = 'recent';
      goTo('search', { direction:'right', resetFilters:true, categoryId: catCard.dataset.category });
      return;
    }

    const favBtn = e.target.closest('[data-fav-toggle]');
    if(favBtn){
      e.stopPropagation();
      toggleFavorite(favBtn.dataset.favToggle, favBtn);
      return;
    }

    const openEl = e.target.closest('[data-open-detail]');
    if(openEl){
      e.stopPropagation();
      openDetail(openEl.dataset.openDetail);
      return;
    }
    const docCard = e.target.closest('.doc-card');
    if(docCard){ openDetail(docCard.dataset.docId); return; }

    const detailAction = e.target.closest('[data-detail-action]');
    if(detailAction && !detailAction.disabled){
      const content = document.getElementById('detail-content');
      const id = content.dataset.docId;
      const doc = state.documents.find(d=>d.id===id);
      const action = detailAction.dataset.detailAction;
      if(!doc) return;
      if(action === 'read'){
        bumpField(doc.id, 'downloads');
        showToast('Ouverture du document…', 'book-open');
        window.open(doc.link, '_blank', 'noopener');
      } else if(action === 'download'){
        bumpField(doc.id, 'downloads');
        showToast('Téléchargement lancé', 'download');
        window.open(doc.link, '_blank', 'noopener');
      } else if(action === 'fav'){
        toggleFavorite(doc.id, null);
        const isFav = favorites.has(doc.id);
        detailAction.classList.toggle('is-fav', isFav);
        detailAction.setAttribute('aria-pressed', isFav);
        const label = detailAction.querySelector('.fav-label');
        if(label) label.textContent = isFav ? 'Retirer des favoris' : 'Ajouter aux favoris';
      }
      return;
    }

    if(e.target.closest('#detail-share')){
      const content = document.getElementById('detail-content');
      const doc = state.documents.find(d=>d.id===content.dataset.docId);
      if(!doc) return;
      if(navigator.share){
        navigator.share({ title: doc.title, text: doc.description, url: doc.link || location.href }).catch(()=>{});
      } else if(navigator.clipboard){
        navigator.clipboard.writeText(doc.link || location.href)
          .then(()=>showToast('Lien copié dans le presse-papiers', 'share'))
          .catch(()=>showToast('Impossible de copier le lien', 'alert-circle', true));
      }
      return;
    }

    if(e.target.closest('#theme-toggle') || e.target.closest('#theme-switch')){
      toggleTheme();
      return;
    }
    const fsBtn = e.target.closest('.segmented-btn[data-fontsize]');
    if(fsBtn){ setFontSize(fsBtn.dataset.fontsize); return; }

    if(e.target.closest('#menu-clear-favs')){
      if(favorites.size === 0){ showToast('Aucun favori à supprimer', 'heart'); return; }
      favorites.clear();
      saveFavorites();
      updateProfileStats();
      showToast('Favoris vidés', 'trash');
      return;
    }

    if(e.target.closest('#notif-btn')){
      const badge = document.getElementById('notif-badge');
      const hadNew = !badge.hidden;
      lastVisit = Date.now();
      Store.set('fasodoc-lastvisit', lastVisit);
      badge.hidden = true;
      if(hadNew) showToast('Voici les derniers ajouts', 'bell');
      else showToast('Tu es à jour, aucune nouveauté', 'bell');
      goTo('search', { sort:'recent', resetFilters:true, direction: TOP_PAGES.includes(currentPage) ? null : 'right' });
      return;
    }

    if(e.target.closest('#search-clear')){
      searchQuery = '';
      renderSearch();
      return;
    }

    const removeTag = e.target.closest('[data-remove-filter]');
    if(removeTag){
      const type = removeTag.dataset.removeFilter;
      const value = removeTag.dataset.value;
      filters[type] = filters[type].filter(v=>v!==value);
      renderSearch();
      return;
    }

    const filterChip = e.target.closest('.filter-chip');
    if(filterChip){
      openFilterSheet(filterChip.dataset.filter);
      return;
    }

    const sheetOpt = e.target.closest('.sheet-option');
    if(sheetOpt){
      const val = sheetOpt.dataset.value;
      if(sheetSelection.includes(val)) sheetSelection = sheetSelection.filter(v=>v!==val);
      else sheetSelection.push(val);
      sheetOpt.classList.toggle('active');
      sheetOpt.setAttribute('aria-pressed', sheetOpt.classList.contains('active'));
      return;
    }

    if(e.target.closest('#sheet-apply')){
      if(activeSheetType) filters[activeSheetType] = [...sheetSelection];
      closeFilterSheet();
      renderSearch();
      return;
    }
    if(e.target.closest('#sheet-reset')){
      if(activeSheetType) filters[activeSheetType] = [];
      closeFilterSheet();
      renderSearch();
      return;
    }
    if(e.target.closest('#sheet-close') || e.target.id === 'sheet-backdrop'){
      closeFilterSheet();
      return;
    }

    const favTabBtn = e.target.closest('[data-fav-tab]');
    if(favTabBtn){
      favTab = favTabBtn.dataset.favTab;
      renderFavorites();
      return;
    }
  });

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && document.getElementById('filter-sheet').classList.contains('active')){
      closeFilterSheet();
    }
  });

  document.getElementById('search-input').addEventListener('input', (e)=>{
    searchQuery = e.target.value;
    document.getElementById('search-clear').hidden = !searchQuery;
    renderSearch();
  });
  document.getElementById('category-search').addEventListener('input', ()=>{
    renderAllCategories();
  });
}

/* ---------- Firebase listeners ---------- */
function loadCategories(){
  onValue(ref(db, 'categories'), (snap)=>{
    const list = snapshotToArray(snap).sort((a,b)=>{
      const ao = (a.order ?? 999), bo = (b.order ?? 999);
      if(ao !== bo) return ao - bo;
      return (a.name||'').localeCompare(b.name||'');
    });
    state.categories = list;
    state.categoriesById = Object.fromEntries(list.map(c=>[c.id, c]));
    state.categoriesLoaded = true;
    populateSuggestSelects();
    refreshAll();
  }, ()=>{
    state.categoriesLoaded = true;
    showToast('Impossible de charger les catégories', 'alert-circle', true);
    refreshAll();
  });
}
function loadDocuments(){
  onValue(ref(db, 'documents'), (snap)=>{
    const all = snapshotToArray(snap);
    state.documents = all.filter(d => d.status !== 'pending' && d.status !== 'rejected');
    state.documentsLoaded = true;
    updateNotifications();
    refreshAll();
    if(currentPage === 'detail'){
      const content = document.getElementById('detail-content');
      if(content.dataset.docId) refreshDetailStats(content.dataset.docId);
    }
  }, ()=>{
    state.documentsLoaded = true;
    showToast('Impossible de charger les documents', 'alert-circle', true);
    refreshAll();
  });
}
function refreshAll(){
  renderHomeCategories();
  renderHomeDocLists();
  if(currentPage === 'search') renderSearch();
  if(currentPage === 'categories') renderAllCategories();
  if(currentPage === 'favorites') renderFavorites();
}

/* ---------- Init ---------- */
function init(){
  applyTheme();
  applyFontSize();
  renderHomeCategories();
  renderHomeDocLists();
  initEvents();
  initSuggestForm();
  updateBottomNav('home');
  mountIcons(document);

  loadCategories();
  loadDocuments();

  setTimeout(()=>{ document.getElementById('splash').classList.add('hidden'); }, 700);
}

document.addEventListener('DOMContentLoaded', init);
