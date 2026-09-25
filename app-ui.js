(function () {
  'use strict';

  var APP_VERSION = '15.25';
  var THEME_KEY = 'wocult_ui_theme';
  var currentSection = 'home';
  var lastDrawerFocus = null;
  var homeActions = [];

  var icons = {
    home:'<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    draft:'<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',
    interview:'<path d="M7 4h10v12H9l-4 4V6a2 2 0 0 1 2-2ZM9 8h6M9 11h4"/>',
    podcast:'<rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    community:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    tracker:'<path d="M4 5h16M4 12h16M4 19h16M7 3v4M12 10v4M17 17v4"/>',
    web:'<path d="M4 5h16v14H4zM4 8l8 6 8-6"/>',
    admin:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/>',
    file:'<path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.15 1.15M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.15-1.15"/>',
    empty:'<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'
  };

  function svg(name, cls) { return '<svg class="'+(cls || '')+'" viewBox="0 0 24 24" aria-hidden="true">'+(icons[name] || icons.file)+'</svg>'; }
  function safe(value) { return typeof escapeHtml === 'function' ? escapeHtml(String(value || '')) : String(value || '').replace(/[&<>"']/g, ''); }
  function initials(user) {
    var name = user && (user.displayName || user.email) || 'Wocult';
    var base = String(name).split('@')[0].replace(/[._-]+/g, ' ').trim();
    var parts = base.split(/\s+/).filter(Boolean);
    return ((parts[0] || 'W').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : (parts[0] || '').charAt(1))).toUpperCase();
  }
  function navItem(id, label, icon, action) { return {id:id,label:label,icon:icon,action:action}; }
  function staffNav() {
    var items = [
      navItem('home','Home','home',function(){ showAppSection('home'); }),
      navItem('draft','Draft new stories','draft',function(){ showAppSection('draft'); }),
      navItem('interviews','Curate interviews','interview',function(){ showAppSection('interviews'); }),
      navItem('podcast','Podcast','podcast',function(){ showAppSection('podcast'); }),
      navItem('community','Manage community','community',function(){ showAppSection('community'); }),
      navItem('editorial','Editorial tracker','tracker',function(){ showAppSection('editorial'); }),
      navItem('webcomm','Web Comm','web',function(){ showAppSection('webcomm'); })
    ];
    if (typeof isAdminUser === 'function' && isAdminUser(currentUser)) items.push(navItem('admin','Admin','admin',function(){ showAppSection('admin'); }));
    return items;
  }
  function roleNav() {
    if (currentAccessMode === 'staff' && typeof isStaffUser === 'function' && isStaffUser(currentUser)) return staffNav();
    if (currentAccessMode === 'podcast_prep_guest') return [navItem('podcast','Podcast Prep','podcast',function(){ if(currentAccessKey) loadPodcastPrepGuestSession(currentAccessKey); })];
    if (currentAccessMode === 'guest_writer') return [navItem('writer','My stories','draft',function(){ showGuestWriterDashboard(); })];
    if (currentAccessMode === 'guest') return [navItem('interview','Interview','interview',function(){ if(currentAccessKey) loadGuestInterview(currentAccessKey); })];
    return [];
  }
  function shellEligible() { return currentAccessMode === 'staff' || currentAccessMode === 'podcast_prep_guest' || currentAccessMode === 'guest_writer' || currentAccessMode === 'guest'; }

  window.setAuthenticatedShellVisible = function (visible) {
    document.body.classList.toggle('app-authenticated', !!visible);
    var sidebar = document.getElementById('app-sidebar');
    if (sidebar) sidebar.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible) closeAppDrawer();
  };
  window.renderAppShell = function () {
    var visible = shellEligible();
    setAuthenticatedShellVisible(visible);
    if (!visible) return;
    if (currentAccessMode === 'podcast_prep_guest') currentSection = 'podcast';
    else if (currentAccessMode === 'guest_writer') currentSection = 'writer';
    else if (currentAccessMode === 'guest') currentSection = 'interview';
    var nav = document.getElementById('app-nav');
    var items = roleNav();
    if (nav) {
      nav.innerHTML = '';
      items.forEach(function(item){
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'app-nav-item' + (item.id === currentSection ? ' active' : '');
        button.setAttribute('data-section', item.id);
        button.setAttribute('aria-current', item.id === currentSection ? 'page' : 'false');
        button.innerHTML = svg(item.icon,'app-nav-icon') + '<span>'+safe(item.label)+'</span>';
        button.addEventListener('click', function(){ closeAppDrawer(); item.action(); });
        nav.appendChild(button);
      });
    }
    var email = currentUser && currentUser.email || (currentAccessMode === 'guest' ? 'Interview guest' : 'Wocult guest');
    var emailEl = document.getElementById('app-profile-email');
    if (emailEl) { emailEl.textContent = email; emailEl.title = email; }
    var avatar = document.getElementById('app-avatar');
    if (avatar) avatar.textContent = initials(currentUser);
    var version = document.getElementById('app-version');
    if (version) version.textContent = 'v'+APP_VERSION;
  };

  window.toggleAppDrawer = function () {
    var open = !document.body.classList.contains('app-drawer-open');
    document.body.classList.toggle('app-drawer-open', open);
    var toggle = document.getElementById('app-menu-toggle');
    if (toggle) { toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); }
    if (open) { lastDrawerFocus = document.activeElement; var first = document.querySelector('.app-nav-item'); if (first) first.focus(); }
  };
  window.closeAppDrawer = function () {
    var wasOpen = document.body.classList.contains('app-drawer-open');
    document.body.classList.remove('app-drawer-open');
    var toggle = document.getElementById('app-menu-toggle');
    if (toggle) { toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-label','Open navigation'); }
    if (wasOpen && lastDrawerFocus && typeof lastDrawerFocus.focus === 'function') lastDrawerFocus.focus();
  };

  window.scrollAppWorkspaceToTop = function () {
    var workspaces = document.querySelectorAll('body.app-authenticated > .app-workspace');
    for (var index = 0; index < workspaces.length; index += 1) {
      if (getComputedStyle(workspaces[index]).display !== 'none') {
        workspaces[index].scrollTo({top:0, left:0, behavior:'auto'});
        return;
      }
    }
    window.scrollTo(0,0);
  };

  function readTheme() { try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch(e) { return 'light'; } }
  function applyTheme(theme) {
    theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    var button = document.getElementById('app-theme-toggle');
    if (button) { button.setAttribute('aria-pressed', String(theme === 'dark')); button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); button.title = theme === 'dark' ? 'Use light theme' : 'Use dark theme'; }
  }
  window.toggleAppTheme = function () { var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(THEME_KEY,next); } catch(e) {} applyTheme(next); };

  var sectionDefinitions = {
    draft:{title:'Draft new stories',sub:'Create, develop and prepare stories for publication.',cards:[
      ['Draft from trending news','Explore current workplace news and develop a Wocult story.','draft',function(){showMain();}],
      ['Draft from a URL','Turn an existing article into an original Wocult draft.','link',function(){showUrlEntry();}],
      ['Write your own story','Shape an original experience, idea or perspective.','file',function(){showScratchChoice();}],
      ['Manual news brief','Prepare CMS fields from a completed news brief.','file',function(){showManualNewsBrief();}],
      ['Manual long-view story','Prepare THA Posts fields from a completed story.','file',function(){showManualLongView();}],
      ['Automated News Briefs','Review automated drafts, decisions and submissions.','tracker',function(){showAutomatedNewsBriefs();}]
    ]},
    interviews:{title:'Curate interviews',sub:'Prepare interviews and review guest responses.',cards:[
      ['Prepare and send questions','Create interview questions from a topic brief.','interview',function(){showPrepareInterview();}],
      ['Guest interview submissions','Review guest responses and final Q&A submissions.','file',function(){showInterviewSubmissions();}]
    ]},
    podcast:{title:'Podcast',sub:'Prepare private podcast guest rehearsal sessions.',cards:[
      ['Podcast Prep Room','Create sessions, review responses and share feedback.','podcast',function(){showPodcastPrepDashboard();}],
      ['New Podcast Prep','Create a private question-by-question preparation session.','file',function(){showPodcastPrepCreate();}]
    ]},
    community:{title:'Manage community',sub:'Review Guest Writer access and submitted stories.',cards:[
      ['Guest writer profiles','Review profiles and approve writing access.','community',function(){showGuestWriterApplications();}],
      ['Guest writer stories','Review submitted drafts and update editorial status.','draft',function(){showStaffGuestWriterStories();}]
    ]},
    editorial:{title:'Editorial tracker',sub:'Track and schedule Wocult editorial work.',cards:[
      ['Editorial tracker','Track interviews, guest stories and Wocult stories.','tracker',function(){showEditorialTracker();}],
      ['Editorial Calendar','Plan and manage content across channels.','calendar',function(){showEditorialCalendar();}]
    ]},
    webcomm:{title:'Website Communications',sub:'Review website messages and reader responses.',cards:[
      ['UNSENT','Review, edit and delete unsent messages.','web',function(){showUnsentAdmin();}],
      ['Blog Comments','Review, edit and delete blog comments.','interview',function(){showBlogCommentsAdmin();}]
    ]},
    admin:{title:'Admin',sub:'Manage authorized Wocult Intelligence settings.',cards:[
      ['Canva Settings','Manage Canva social template settings.','admin',function(){showAdminDashboard();}]
    ]}
  };

  function setSection(section, title) {
    currentSection = section;
    renderAppShell();
  }
  function overviewRoot() { return document.getElementById('landing-cards'); }
  function emptyState(title, copy) { return '<div class="app-empty"><span class="app-empty-icon">'+svg('empty')+'</span><strong>'+safe(title)+'</strong><span>'+safe(copy)+'</span></div>'; }
  function panelHeading(title, icon, tone) { return '<header class="app-panel-heading"><span class="app-panel-icon '+safe(tone)+'">'+svg(icon)+'</span><h2>'+safe(title)+'</h2></header>'; }
  function renderCards(def) {
    var draftActions = ['Open dashboard','Paste a URL','Start writing','Open editor','Open editor','Review briefs'];
    var isDraft = def === sectionDefinitions.draft;
    return '<div class="app-overview"><header class="app-page-header"><div><h1>'+safe(def.title)+'</h1><p>'+safe(def.sub)+'</p></div></header><div class="app-launcher-grid">'+def.cards.map(function(card,index){
      var divider = isDraft && (index === 0 || index === 3) ? '<div class="app-draft-divider">'+(index === 0 ? 'Draft new stories' : 'More ways to draft')+'</div>' : '';
      return divider+'<button type="button" class="app-launcher" data-card-index="'+index+'"><span class="app-launcher-icon">'+svg(card[2])+'</span><span class="app-launcher-title">'+safe(card[0])+'</span><span class="app-launcher-desc">'+safe(card[1])+'</span><span class="app-launcher-action">'+(isDraft ? draftActions[index] : 'Open')+'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span><span class="app-launcher-chevron" aria-hidden="true">&#8250;</span></button>';
    }).join('')+'</div></div>';
  }
  function bindCards(def) { document.querySelectorAll('#landing-cards .app-launcher').forEach(function(card){ card.addEventListener('click',def.cards[Number(card.getAttribute('data-card-index'))][3]); }); }

  function timestampValue(value) { if (!value) return 0; if (typeof value.toMillis === 'function') return value.toMillis(); if (value.seconds) return value.seconds*1000; var parsed = new Date(value).getTime(); return isNaN(parsed) ? 0 : parsed; }
  function homeRecord(title, meta, action) { var index=homeActions.push(action)-1; return '<button type="button" class="app-record" data-home-action="'+index+'"><span class="app-record-copy"><span class="app-record-title">'+safe(title)+'</span><span class="app-record-meta">'+safe(meta)+'</span></span><span class="app-record-chevron" aria-hidden="true">›</span></button>'; }
  function bindHomeActions() { document.querySelectorAll('[data-home-action]').forEach(function(el){el.addEventListener('click',function(){var fn=homeActions[Number(el.getAttribute('data-home-action'))];if(fn)fn();});}); }
  function renderHomeShell() {
    var root=overviewRoot(); if(!root)return;
    homeActions=[];
    root.innerHTML='<div class="app-overview"><header class="app-page-header"><div><h1>Home</h1><p>Your editorial work and upcoming schedule.</p></div></header><div class="app-dashboard-grid"><section class="app-dashboard-panel attention">'+panelHeading('Needs attention','empty','attention')+'<div id="app-home-attention">'+emptyState('Checking current work','Loading actionable editorial items.')+'</div></section><section class="app-dashboard-panel">'+panelHeading('Upcoming','calendar','upcoming')+'<div id="app-home-upcoming">'+emptyState('Checking the calendar','Loading upcoming Editorial Calendar items.')+'</div></section><section class="app-dashboard-panel">'+panelHeading('Recent activity','tracker','activity')+emptyState('No activity history available','A reliable cross-product activity source is not currently available.')+'</section></div></div>';
  }
  function loadHomeData() {
    if (!window.db || currentAccessMode !== 'staff') return;
    var attention=document.getElementById('app-home-attention'); var upcoming=document.getElementById('app-home-upcoming');
    Promise.all([
      db.collection('podcast_sessions').orderBy('updatedAt','desc').limit(20).get().catch(function(){return null;}),
      db.collection('articles').where('sourceType','==','guest_writer').orderBy('updatedAt','desc').limit(20).get().catch(function(){return null;}),
      db.collection('unsent_submissions').limit(20).get().catch(function(){return null;})
    ]).then(function(results){
      if(!document.getElementById('app-home-attention'))return;
      var rows=[];
      if(results[0])results[0].forEach(function(doc){var d=doc.data()||{};if(d.status==='submitted')rows.push({time:timestampValue(d.updatedAt||d.submittedAt),html:homeRecord(d.podcastTitle||'Podcast Prep response',(d.guestName||'Guest')+' · Awaiting staff review',function(){openPodcastPrepStaffSessionFromRoute(doc.id);})});});
      if(results[1])results[1].forEach(function(doc){var d=doc.data()||{};if(['submitted','under_review','story_under_review'].indexOf(d.status)!==-1)rows.push({time:timestampValue(d.updatedAt||d.submittedAt),html:homeRecord(d.title||d.workingTitle||'Guest Writer story',(d.writerName||'Guest writer')+' · Awaiting review',function(){showStaffGuestWriterStories();setTimeout(function(){openStaffGuestWriterStory(doc.id);},0);})});});
      if(results[2])results[2].forEach(function(doc){var d=doc.data()||{};rows.push({time:timestampValue(d.updatedAt||d.createdAt),html:homeRecord(d.subject||d.title||'Unsent website communication','UNSENT · Requires review',function(){showUnsentAdmin();})});});
      rows.sort(function(a,b){return b.time-a.time;});
      attention.innerHTML=rows.length?'<div class="app-record-list">'+rows.slice(0,8).map(function(r){return r.html;}).join('')+'</div>':emptyState('Nothing needs attention','No actionable Podcast Prep, Guest Writer or UNSENT records were found.'); bindHomeActions();
    }).catch(function(){if(attention)attention.innerHTML=emptyState('Could not load attention items','Open the relevant section to review current work.');});
    db.collection('editorial_calendar').get().then(function(snap){
      if(!document.getElementById('app-home-upcoming'))return; var today=new Date();today.setHours(0,0,0,0);var entries=[];
      snap.forEach(function(doc){var d=doc.data()||{};var when=new Date(d.publishDate);if(!isNaN(when)&&when>=today&&!d.archived)entries.push({id:doc.id,data:d,when:when});}); entries.sort(function(a,b){return a.when-b.when;});
      upcoming.innerHTML=entries.length?'<div class="app-record-list">'+entries.slice(0,6).map(function(entry){return homeRecord(entry.data.title||'Calendar item',entry.when.toLocaleDateString(undefined,{day:'numeric',month:'short'})+(entry.data.status?' · '+entry.data.status:''),function(){showEditorialCalendar();});}).join('')+'</div>':emptyState('No upcoming items','The Editorial Calendar has no upcoming entries.'); bindHomeActions();
    }).catch(function(){if(upcoming)upcoming.innerHTML=emptyState('Could not load the calendar','Open Editorial Calendar to review the schedule.');});
  }

  window.showAppSection = function (section, options) {
    if (currentAccessMode !== 'staff' || (typeof isStaffUser === 'function' && !isStaffUser(currentUser))) { renderAppShell(); return; }
    if (section === 'admin' && (typeof isAdminUser !== 'function' || !isAdminUser(currentUser))) { if(typeof guardAdminScreen==='function')guardAdminScreen(); return; }
    if (!options || !options.skipHide) { if(typeof hideStaffLandingPanels==='function')hideStaffLandingPanels(); document.getElementById('landing').style.display='block'; document.getElementById('landing-cards').style.display='flex'; document.getElementById('main').style.display='none'; document.getElementById('workflow').style.display='none'; }
    setSection(section, section==='home'?'Home':null);
    if(section==='home'){renderHomeShell();loadHomeData();return;}
    var def=sectionDefinitions[section]; if(!def)return; overviewRoot().innerHTML=renderCards(def);bindCards(def);
  };

  function wrapScreenFunction(name, section, title, crumb) {
    var original=window[name]; if(typeof original!=='function')return;
    window[name]=function(){var result=original.apply(this,arguments);setSection(section,title);var target=document.querySelector('#landing .landing[style*="display: flex"],#landing .landing[style*="display:flex"]');if(target&&crumb&&!target.querySelector('.app-breadcrumbs')){var inner=target.firstElementChild;if(inner){var node=document.createElement('div');node.className='app-breadcrumbs';node.textContent=crumb;inner.insertBefore(node,inner.firstChild);}}return result;};
  }

  window.initializeAppUi = function () {
    applyTheme(readTheme());
    document.addEventListener('keydown',function(event){if(event.key==='Escape')closeAppDrawer();if(event.key==='Tab'&&document.body.classList.contains('app-drawer-open')){var focusable=Array.prototype.slice.call(document.querySelectorAll('#app-sidebar button:not([disabled])'));if(!focusable.length)return;var first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    wrapScreenFunction('showMain','draft','Draft from trending news','Draft new stories / Draft from trending news');
    wrapScreenFunction('showUrlEntry','draft','Draft from a URL','Draft new stories / Draft from a URL');
    wrapScreenFunction('showPrepareInterview','interviews','Prepare interview','Curate interviews / Prepare interview');
    wrapScreenFunction('showInterviewSubmissions','interviews','Guest interview submissions','Curate interviews / Guest interview submissions');
    wrapScreenFunction('showPodcastPrepDashboard','podcast','Podcast Prep Room','Podcast / Podcast Prep Room');
    wrapScreenFunction('showPodcastPrepCreate','podcast','New Podcast Prep','Podcast / Podcast Prep / New session');
    wrapScreenFunction('showGuestWriterApplications','community','Guest writer profiles','Manage community / Guest Writer Profiles');
    wrapScreenFunction('showStaffGuestWriterStories','community','Guest writer stories','Manage community / Guest Writer Stories');
    wrapScreenFunction('showEditorialTracker','editorial','Editorial tracker','Editorial tracker / Records');
    wrapScreenFunction('showEditorialCalendar','editorial','Editorial Calendar','Editorial tracker / Editorial Calendar');
    wrapScreenFunction('showUnsentAdmin','webcomm','UNSENT','Web Comm / UNSENT');
    wrapScreenFunction('showBlogCommentsAdmin','webcomm','Blog Comments','Web Comm / Blog Comments');
    wrapScreenFunction('showAdminDashboard','admin','Canva Settings','Admin / Canva Settings');
    renderAppShell();
  };
  initializeAppUi();
}());
