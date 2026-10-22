'use strict';
// Filter status: lists every filter on the dashboard's worksheets and flags
// which ones are active (narrowing the data). Re-renders on any filter change.
(function () {
  var unregister = [];

  window.onload = function () {
    renderMessage('Loading...');
    tableau.extensions.initializeAsync().then(function () {
      var dashboard = tableau.extensions.dashboardContent.dashboard;
      dashboard.worksheets.forEach(function (ws) {
        unregister.push(ws.addEventListener(tableau.TableauEventType.FilterChanged, render));
      });
      render();
    }, function (err) {
      renderMessage('Init error: ' + describeError(err));
    });
  };

  function render() {
    var dashboard = tableau.extensions.dashboardContent.dashboard;
    Promise.all(dashboard.worksheets.map(function (ws) {
      return ws.getFiltersAsync().then(function (filters) {
        return filters.map(function (f) { return describe(f, ws.name); });
      });
    })).then(function (lists) {
      // The same filter can be applied to several sheets: merge by field name.
      var byField = {};
      lists.forEach(function (list) {
        list.forEach(function (d) {
          var e = byField[d.field];
          if (!e) { byField[d.field] = d; e = d; }
          e.active = e.active || d.active;
          if (d.active && e.detail !== d.detail && e.detail === 'All') e.detail = d.detail;
          if (e.sheets.indexOf(d.sheets[0]) < 0) e.sheets.push(d.sheets[0]);
        });
      });
      renderFilters(Object.keys(byField).sort().map(function (k) { return byField[k]; }));
    }, function (err) {
      renderMessage('Error reading filters: ' + describeError(err));
    });
  }

  // Clears every filter on every worksheet in the dashboard.
  function resetAll() {
    var dashboard = tableau.extensions.dashboardContent.dashboard;
    Promise.all(dashboard.worksheets.map(function (ws) {
      return ws.getFiltersAsync().then(function (filters) {
        return Promise.all(filters.map(function (f) { return ws.clearFilterAsync(f.fieldName); }));
      });
    })).then(render, function (err) {
      renderMessage('Error resetting filters: ' + describeError(err));
    });
  }

  // Clears a single field's filter on every worksheet that uses it.
  function resetField(fieldName) {
    var dashboard = tableau.extensions.dashboardContent.dashboard;
    Promise.all(dashboard.worksheets.map(function (ws) {
      return ws.getFiltersAsync().then(function (filters) {
        var hit = filters.some(function (f) { return f.fieldName === fieldName; });
        return hit ? ws.clearFilterAsync(fieldName) : null;
      });
    })).then(render, function (err) {
      renderMessage('Error resetting ' + fieldName + ': ' + describeError(err));
    });
  }

  function describe(f, sheetName) {
    var active = false, detail = '';
    if (f.filterType === 'categorical') {
      active = !f.isAllSelected;
      var vals = (f.appliedValues || []).map(function (v) { return v.formattedValue; });
      detail = f.isAllSelected ? 'All'
        : (vals.length > 4 ? vals.slice(0, 4).join(', ') + ' +' + (vals.length - 4) + ' more' : vals.join(', '));
      if (f.isExcludeMode && !f.isAllSelected) detail = 'Exclude: ' + detail;
    } else if (f.filterType === 'range') {
      var min = f.minValue && f.minValue.formattedValue, max = f.maxValue && f.maxValue.formattedValue;
      detail = min + ' – ' + max;
      var dmin = f.domainMin && f.domainMin.formattedValue, dmax = f.domainMax && f.domainMax.formattedValue;
      active = !(min === dmin && max === dmax);
      if (!active) detail = 'Full range';
    } else if (f.filterType === 'relative-date') {
      active = true;
      detail = f.periodType + ' / ' + f.rangeType + (f.rangeN != null ? ' (' + f.rangeN + ')' : '');
    } else {
      active = true;
      detail = f.filterType;
    }
    return { field: f.fieldName, active: active, detail: detail, sheets: [sheetName] };
  }

  function renderFilters(items) {
    var root = clearRoot();
    var activeItems = items.filter(function (i) { return i.active; });

    var banner = el('div', 'banner ' + (activeItems.length ? 'on' : 'off'));
    banner.textContent = activeItems.length
      ? activeItems.length + ' of ' + items.length + ' filter' + (items.length === 1 ? '' : 's') + ' active'
      : (items.length ? 'No filters active' : 'No filters on this dashboard');
    root.appendChild(banner);

    var reset = el('button', 'reset');
    reset.textContent = 'Reset all filters';
    reset.disabled = !activeItems.length;
    reset.onclick = resetAll;
    root.appendChild(reset);

    items.forEach(function (i) {
      var row = el('div', 'row');
      var dot = el('span', 'dot ' + (i.active ? 'on' : 'off'));
      var name = el('span', 'name'); name.textContent = i.field;
      var state = el('span', 'state'); state.textContent = i.active ? 'Active' : 'Inactive';
      var det = el('div', 'detail'); det.textContent = i.detail + '  ·  ' + i.sheets.join(', ');
      var top = el('div', 'top');
      var btn = el('button', 'reset-one');
      btn.textContent = 'Reset';
      btn.disabled = !i.active;
      btn.onclick = function () { resetField(i.field); };
      top.appendChild(dot); top.appendChild(name); top.appendChild(state); top.appendChild(btn);
      row.appendChild(top); row.appendChild(det);
      root.appendChild(row);
    });
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function renderMessage(text) {
    var root = clearRoot();
    var p = document.createElement('p');
    p.textContent = text;
    root.appendChild(p);
  }

  function clearRoot() {
    var e = document.getElementById('content');
    while (e.firstChild) e.removeChild(e.firstChild);
    return e;
  }

  function describeError(err) {
    return (err && err.message) ? err.message : String(err);
  }
})();
