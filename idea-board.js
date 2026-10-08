/* Staff-only Idea board. Uses the existing auth helpers, shell and Firestore client. */
(function () {
  'use strict';
  var root, stopIdeas, stopComments, dialog, focusReturn, selected, busy = false, generation = 0;
  var ideas = [], userScope = '';
  function allowed() { return currentAccessMode === 'staff' && isStaffUser(currentUser) && currentUser.uid === userScope; }
  function admin() { return allowed() && isAdminUser(currentUser); }
  function editable(idea) { return allowed() && (admin() || idea.createdByUid === currentUser.uid); }
  function esc(value) { return escapeHtml(String(value == null ? '' : value)); }
  function name(record) { return record.createdByName || record.createdByEmail || 'Staff member'; }
  function date(value, time) {
    if (!value || typeof value.toDate !== 'function') return 'Saving date…';
    return value.toDate().toLocaleString(undefined, Object.assign({day:'numeric',month:'short',year:'numeric'}, time ? {hour:'numeric',minute:'2-digit'} : {}));
  }
  function badge(idea) { return '<span class="idea-priority idea-priority-'+esc(idea.priority)+'">'+esc(({high:'High',medium:'Medium',low:'Low'})[idea.priority] || '')+' priority</span>'; }
  function button(text, action, cls) { return '<button type="button" class="btn '+(cls || '')+'" data-idea-action="'+action+'">'+text+'</button>'; }
  function feedback(message) { var el = root && root.querySelector('#idea-feedback'); if (el) el.textContent = message; }
  function closeDialog(force) {
    if (busy && !force) return;
    if (stopComments) stopComments(); stopComments = null; selected = null;
    if (dialog) { dialog.close(); dialog.remove(); dialog = null; }
    if (focusReturn && focusReturn.isConnected) focusReturn.focus();
    else if(root && root.querySelector('.idea-new'))root.querySelector('.idea-new').focus();
  }
  window.stopIdeaBoard = function () {
    generation++; if (stopIdeas) stopIdeas(); stopIdeas = null;
    closeDialog(true); if(root){root.onclick=null;root.innerHTML='';} root = null; ideas = []; userScope = ''; busy = false;
  };
  function openDialog(title) {
    closeDialog(); focusReturn = document.activeElement;
    dialog = document.createElement('dialog'); dialog.className = 'idea-dialog';
    dialog.setAttribute('aria-labelledby','idea-dialog-title');
    dialog.innerHTML = '<header class="idea-dialog-header"><h2 id="idea-dialog-title">'+esc(title)+'</h2>'+button('Close','close')+'</header><div id="idea-dialog-body"></div><p id="idea-dialog-error" role="alert"></p>';
    dialog.addEventListener('cancel', function(event) { event.preventDefault(); closeDialog(); });
    dialog.addEventListener('click', function(event) { var action = event.target.closest('[data-idea-action]'); if (action && action.dataset.ideaAction === 'close') closeDialog(); });
    document.body.appendChild(dialog); dialog.showModal(); return dialog.querySelector('#idea-dialog-body');
  }
  function error(message) { var el = dialog && dialog.querySelector('#idea-dialog-error'); if (el) el.textContent = message; }
  function setBusy(value) { busy = value; if(dialog) dialog.querySelectorAll('button').forEach(function(b){ b.disabled = value; }); }
  function identity() { return {createdByUid:currentUser.uid,createdByEmail:currentUser.email,createdByName:currentUser.displayName || currentUser.email}; }
  function stamp() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function drawBoard() {
    if (!root || !allowed()) return;
    var list = root.querySelector('#idea-list');
    if (!ideas.length) {
      list.className = 'app-dashboard-panel idea-empty';
      list.innerHTML = '<h2>Capture the ideas worth coming back to.</h2><p>Use Idea board to save ideas before they get lost. Add what the idea is about, set its priority, and use comments to discuss it with the team.</p>'+button('+ Add your first idea','new');
      return;
    }
    list.className = 'idea-grid';
    list.innerHTML = ideas.map(function(idea) {
      return '<button type="button" class="idea-card" data-idea-id="'+esc(idea.id)+'">'+badge(idea)+'<h2>'+esc(idea.title)+'</h2><p class="idea-preview">'+esc(idea.description)+'</p><span class="idea-meta">Added by '+esc(name(idea))+' · '+esc(date(idea.createdAt))+'</span><span class="idea-open">Open discussion <span aria-hidden="true">→</span></span></button>';
    }).join('');
  }
  window.mountIdeaBoard = function (container) {
    window.stopIdeaBoard();
    if (currentAccessMode !== 'staff' || !isStaffUser(currentUser)) return;
    userScope = currentUser.uid; root = container; var epoch = generation;
    root.innerHTML = '<div class="app-overview idea-board"><header class="app-page-header"><div><h1>Idea board</h1><p>Capture ideas, discuss them with the team, and keep them visible.</p></div>'+button('+ New idea','new','idea-new')+'</header><p id="idea-feedback" role="status" aria-live="polite"></p><div id="idea-list" aria-live="polite">Loading ideas…</div></div>';
    root.onclick = function(event) {
      if (!allowed()) return;
      var action = event.target.closest('[data-idea-action]'), card = event.target.closest('[data-idea-id]');
      if (action && action.dataset.ideaAction === 'new') editIdea(null);
      else if (card) { var idea = ideas.find(function(i){return i.id === card.dataset.ideaId;}); if (idea) detail(idea); }
    };
    stopIdeas = db.collection('ideas').orderBy('createdAt','desc').onSnapshot(function(snapshot) {
      if (epoch !== generation || !allowed()) return;
      ideas = snapshot.docs.map(function(doc){return Object.assign({id:doc.id},doc.data());}); drawBoard();
      if (selected && dialog && dialog.querySelector('#idea-description')) {
        var latest = ideas.find(function(i){return i.id === selected.id;});
        if (latest) { selected = latest; updateDetail(); }
        else if (!busy) { closeDialog(); feedback('This idea was deleted.'); }
      }
    }, function() {
      if (epoch !== generation || !allowed()) return;
      root.querySelector('#idea-list').textContent = 'Failed to load ideas. Open Idea board again to retry.';
    });
  };
  function editIdea(idea) {
    if (!allowed() || (idea && !editable(idea)) || busy) return;
    var body = openDialog(idea ? 'Edit idea' : 'New idea'), epoch = generation;
    body.innerHTML = '<form id="idea-form"><label class="wf-label" for="idea-title">Idea title</label><input class="wf-input" id="idea-title" name="title" required maxlength="200"><label class="wf-label" for="idea-description-input">What is the idea about?</label><textarea class="wf-textarea" id="idea-description-input" name="description" required maxlength="10000" rows="6"></textarea><label class="wf-label" for="idea-priority-input">Priority</label><select class="wf-input" id="idea-priority-input" name="priority" required><option value="">Select priority</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select><div class="idea-actions">'+button('Cancel','close')+'<button class="btn" type="submit">'+(idea ? 'Save changes' : 'Save idea')+'</button></div></form>';
    var form = body.querySelector('form');
    if(idea) { form.elements.title.value = idea.title; form.elements.description.value = idea.description; form.elements.priority.value = idea.priority; }
    form.elements.title.focus();
    form.onsubmit = async function(event) {
      event.preventDefault(); if (busy || !allowed() || (idea && !editable(idea))) return;
      var title = form.elements.title.value.trim(), description = form.elements.description.value.trim(), priority = form.elements.priority.value;
      if (!title || !description || !['high','medium','low'].includes(priority)) { error('Enter a title, description and priority.'); return; }
      setBusy(true); error('');
      try {
        var data = {title:title,description:description,priority:priority,updatedAt:stamp()};
        if (idea) await db.collection('ideas').doc(idea.id).update(data);
        else await db.collection('ideas').add(Object.assign(data,identity(),{createdAt:stamp()}));
        if (epoch !== generation) return;
        setBusy(false);closeDialog();feedback(idea ? 'Idea updated.' : 'Idea saved.');
      } catch (_) { if(epoch === generation){setBusy(false);error(idea ? 'Failed to update idea. Please try again.' : 'Failed to save idea. Please try again.');} }
    };
  }
  function updateDetail() {
    if (!selected || !dialog) return;
    dialog.querySelector('#idea-dialog-title').textContent = selected.title;
    dialog.querySelector('#idea-description').textContent = selected.description;
    dialog.querySelector('#idea-detail-meta').textContent = 'Added by '+name(selected)+' · '+date(selected.createdAt,true);
    dialog.querySelector('#idea-detail-priority').innerHTML = badge(selected);
  }
  function detail(idea) {
    if(!allowed() || busy)return;
    var body = openDialog(idea.title), epoch = generation; selected = idea;
    body.innerHTML = '<div id="idea-detail-priority"></div><p id="idea-description" class="idea-description"></p><p id="idea-detail-meta" class="idea-meta"></p><div class="idea-actions">'+(editable(idea) ? button('Edit idea','edit') : '')+(admin() ? button('Delete idea','delete','idea-danger') : '')+'</div><section class="idea-discussion"><h3>Comments</h3><div id="idea-comments" aria-live="polite">Loading comments…</div><form id="idea-comment-form"><label class="wf-label" for="idea-comment">Add a comment</label><textarea id="idea-comment" class="wf-textarea" required maxlength="4000" rows="3" placeholder="Add a comment..."></textarea><button class="btn" type="submit">Post comment</button><p id="idea-comment-feedback" role="status"></p></form></section>';
    updateDetail();
    body.onclick = function(event){ var el = event.target.closest('[data-idea-action]'); if (!el || busy)return; if(el.dataset.ideaAction==='edit')editIdea(selected);if(el.dataset.ideaAction==='delete')confirmDelete(selected); };
    var comments = body.querySelector('#idea-comments'), ref = db.collection('ideas').doc(idea.id);
    stopComments = ref.collection('comments').orderBy('createdAt','asc').onSnapshot(function(snapshot){
      if(epoch!==generation || !allowed() || !comments.isConnected)return;
      comments.innerHTML = snapshot.empty ? '<p class="idea-meta">No comments yet. Start the discussion.</p>' : snapshot.docs.map(function(doc){var c=doc.data();return '<article class="idea-comment"><p class="idea-meta">'+esc(name(c))+' · '+esc(date(c.createdAt,true))+'</p><p class="idea-description">'+esc(c.body)+'</p></article>';}).join('');
    },function(){if(comments.isConnected)comments.textContent='Failed to load comments. Reopen this idea to retry.';});
    body.querySelector('form').onsubmit = async function(event){
      event.preventDefault();if(busy || !allowed())return;
      var input=body.querySelector('#idea-comment'), text=input.value.trim();if(!text){error('Enter a comment.');return;}
      setBusy(true);error('');
      try { await ref.collection('comments').add(Object.assign({body:text,createdAt:stamp()},identity()));
        if(epoch===generation){setBusy(false);input.value='';body.querySelector('#idea-comment-feedback').textContent='Comment posted.';input.focus();}
      } catch(_){if(epoch===generation){setBusy(false);error('Failed to post comment. Please try again.');}}
    };
  }
  function confirmDelete(idea) {
    if(!admin() || busy)return;
    var body=openDialog('Delete this idea?'), epoch=generation;
    body.innerHTML='<p>This permanently removes the idea and its comments.</p><div class="idea-actions">'+button('Cancel','close')+button('Delete idea','confirm-delete','idea-danger')+'</div>';
    body.querySelector('[data-idea-action="close"]').focus();
    body.querySelector('[data-idea-action="confirm-delete"]').onclick=async function(){
      if(!admin() || busy)return;setBusy(true);error('');var parentRemoved=false;
      try {
        var ref=db.collection('ideas').doc(idea.id);await ref.delete();parentRemoved=true;
        // Parent deletion prevents new comments; paginate to respect Firestore batch limits.
        while(true){var rows=await ref.collection('comments').limit(400).get();if(rows.empty)break;var batch=db.batch();rows.docs.forEach(function(doc){batch.delete(doc.ref);});await batch.commit();}
        if(epoch===generation){setBusy(false);closeDialog();feedback('Idea deleted.');}
      }catch(_){if(epoch===generation){setBusy(false);error(parentRemoved ? 'Idea removed, but comment cleanup failed. Select Delete idea to retry cleanup.' : 'Failed to delete idea. Please try again.');}}
    };
  }
}());
