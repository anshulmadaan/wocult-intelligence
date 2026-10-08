/* Back navigation is an in-memory, role-scoped list of approved application actions, never browser history. */
(function () {
  'use strict';
  var trail = [], current = null, scope = '', depth = 0, restoring = false;
  var routes = Object.create(null);
  function sessionScope() { return (currentUser && currentUser.uid || '')+'|'+currentAccessMode+'|'+(currentAccessKey || ''); }
  function syncScope() { var next=sessionScope(); if(next!==scope){trail=[];current=null;scope=next;} }
  function allowed(route) {
    if (!currentUser || !route) return false;
    if (route.role === 'writer') return currentAccessMode === 'guest_writer';
    return currentAccessMode === 'staff' && isStaffUser(currentUser) && (route.key !== 'admin' && route.key !== 'canva' || isAdminUser(currentUser));
  }
  function remember(entry) {
    syncScope(); if(restoring || !allowed(entry.route))return;
    if(current && current.id===entry.id)return;
    if(current && allowed(current.route))trail.push(current);
    if(trail.length>40)trail.shift();
    current=entry;
  }
  function register(key, name, role) {
    var original=window[name]; if(typeof original!=='function')return;
    var route=routes[key]={key:key,name:name,role:role||'staff'};
    window[name]=function(){
      syncScope(); var outer=depth===0, args=Array.prototype.slice.call(arguments), result;
      depth++;
      try { result=original.apply(this,args); } finally { depth--; }
      if(outer && allowed(route))remember({route:route,args:args,id:key+':'+(typeof args[0]==='string'?args[0]:'')});
      return result;
    };
  }
  [
    ['trending','showMain'],['url','showUrlEntry'],['manual-news','showManualNewsBrief'],['manual-long','showManualLongView'],
    ['scratch-choice','showScratchChoice'],['scratch','showScratchForm'],['existing-draft','showExistingDraftForm'],
    ['automated','showAutomatedNewsBriefs'],['podcast-list','showPodcastPrepDashboard'],['podcast-create','showPodcastPrepCreate'],
    ['profiles','showGuestWriterApplications'],['writer-stories','showStaffGuestWriterStories'],['interview-list','showInterviewSubmissions'],
    ['interview-create','showPrepareInterview'],['tracker','showEditorialTracker'],['calendar','showEditorialCalendar'],
    ['unsent','showUnsentAdmin'],['comments','showBlogCommentsAdmin'],['canva','showAdminDashboard'],
    ['writer-dashboard','showGuestWriterDashboard','writer'],['writer-story','viewGuestWriterStory','writer'],['writer-idea','showSubmitStoryIdeaScreen','writer']
  ].forEach(function(r){register(r[0],r[1],r[2]);});
  var sectionOriginal=window.showAppSection;
  ['home','ideas','draft','interviews','podcast','community','editorial','webcomm','admin'].forEach(function(key){routes[key]={key:key,role:'staff',section:key};});
  window.showAppSection=function(section, options){
    syncScope(); var outer=depth===0;depth++;
    try { sectionOriginal(section,options); } finally { depth--; }
    if(outer && routes[section] && routes[section].section)remember({route:routes[section],args:[],id:section});
  };
  function restore(entry) {
    restoring=true;
    try {
      if(typeof closeEditorialTrackerOverlay==='function')closeEditorialTrackerOverlay();
      if(entry.route.section)window.showAppSection(entry.route.section);
      else {
        if(entry.route.role!=='writer'){
          hideAllAppScreens();document.getElementById('landing').style.display='block';
        }
        window[entry.route.name].apply(window,entry.args);
      }
      current=entry;
      var selections={'podcast-list':'podcast-prep-detail','writer-stories':'staff-guest-writer-story-detail','profiles':'guest-writer-application-detail','interview-list':'interview-submission-detail','automated':'automated-news-brief-detail'};
      var panel=document.getElementById(selections[entry.route.key] || '');
      if(panel)panel.textContent='Select a record to review.';
    } finally { restoring=false; }
  }
  window.goBackInApp=function(fallback, parentIsCurrent) {
    syncScope();
    // Guests can never restore staff, auth or another invitation's history.
    if(currentAccessMode==='guest_writer' && !allowed(routes[fallback]))fallback='writer-dashboard';
    var target=routes[fallback];if(!allowed(target))return;
    var leave=function(){
      var previous=parentIsCurrent && current && allowed(current.route) ? current : null;
      while(trail.length && !previous){var candidate=trail.pop();if(allowed(candidate.route))previous=candidate;}
      restore(previous||{route:target,args:[],id:fallback});
    };
    confirmBeforeLeavingScreen(leave);
  };
  // Detail panels render asynchronously inside their parent list; their Back restores that parent context.
  [
    ['renderPodcastPrepStaffDetail','podcast-prep-detail','podcast-list'],
    ['openStaffGuestWriterStory','staff-guest-writer-story-detail','writer-stories'],
    ['openGuestWriterApplication','guest-writer-application-detail','profiles'],
    ['renderInterviewSubmissionDetail','interview-submission-detail','interview-list'],
    ['renderAutomatedNewsBriefDetail','automated-news-brief-detail','automated']
  ].forEach(function(item){
    var original=window[item[0]];if(typeof original!=='function')return;
    window[item[0]]=function(){
      var result=original.apply(this,arguments), panel=document.getElementById(item[1]);
      if(panel && panel.childElementCount && !panel.querySelector('.app-detail-back')){
        var button=document.createElement('button');button.type='button';button.className='app-back-link app-detail-back';button.textContent='? Back';
        button.addEventListener('click',function(){goBackInApp(item[2],true);});panel.insertBefore(button,panel.firstChild);
      }
      return result;
    };
  });
  window.resetAppBackNavigation=function(){trail=[];current=null;scope=sessionScope();};
  var shellVisibility=window.setAuthenticatedShellVisible;
  if(typeof shellVisibility==='function')window.setAuthenticatedShellVisible=function(visible){if(!visible)resetAppBackNavigation();return shellVisibility(visible);};
}());
