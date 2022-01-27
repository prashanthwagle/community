void (function () {
  const community = function (window, document, site) {
    'use strict'
    if (!Object.hasOwn) {
      Object.defineProperty(Object, 'hasOwn', {
        value: function (object, property) {
          if (object == null) {
            throw new TypeError('Cannot convert undefined or null to object')
          }
          return Object.prototype.hasOwnProperty.call(Object(object), property)
        },
        configurable: true,
        enumerable: false,
        writable: true,
      })
    }
    const palettes = {
        // from https://colorbrewer2.org
        rdylbu7: ['#d73027', '#fc8d59', '#fee090', '#adadad', '#e0f3f8', '#91bfdb', '#4575b4'],
        orrd7: ['#fef0d9', '#fdd49e', '#fdbb84', '#fc8d59', '#ef6548', '#d7301f', '#990000'],
        gnbu7: ['#a8ddb5', '#ccebc5', '#f0f9e8', '#adadad', '#4eb3d3', '#2b8cbe', '#08589e'],
        brbg7: ['#8c510a', '#d8b365', '#f6e8c3', '#adadad', '#c7eae5', '#5ab4ac', '#01665e'],
        puor7: ['#b35806', '#f1a340', '#fee0b6', '#adadad', '#d8daeb', '#998ec3', '#542788'],
        prgn6: ['#762a83', '#af8dc3', '#e7d4e8', '#d9f0d3', '#7fbf7b', '#1b7837'],
        reds5: ['#f1eef6', '#d7b5d8', '#df65b0', '#dd1c77', '#980043'],
        greens5: ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837'],
        greys4: ['#f7f7f7', '#cccccc', '#969696', '#525252'],
        paired4: ['#1f78b4', '#a6cee3', '#b2df8a', '#33a02c'],
      },
      patterns = {
        seps: /[\s._-]/g,
        period: /\./,
        all_periods: /\./g,
        word_start: /\b(\w)/g,
        settings: /^settings\./,
        features: /^features\./,
        data: /^data\./,
        variables: /^variables\./,
        palette: /^pal/,
        datasets: /^dat/,
        variable: /^var/,
        levels: /^lev/,
        ids: /^ids/,
        minmax: /^m[inax]{2}$/,
        int_types: /^(?:count|year)$/,
        end_punct: /[.?!]$/,
        mustache: /\{(.*?)\}/g,
        measure_name: /(?:^measure|_name)$/,
        http: /^https?:\/\//,
        bool: /^(?:true|false)$/,
        number: /^[\d-][\d.,]*$/,
        leading_zeros: /^0+/,
      },
      conditionals = {
        setting: function (u) {
          var k,
            l,
            v = u.value(),
            theme = v ? 'dark' : 'light'
          if (v !== site.settings[u.setting]) {
            site.settings[u.setting] = v
            if ('theme_dark' === u.setting) {
              v
                ? document.body.classList.replace('light-theme', 'dark-theme')
                : document.body.classList.replace('dark-theme', 'light-theme')
              if (site.plots) for (k in site.plots) if (Object.hasOwn(site.plots, k)) update_plot_theme(site.plots[k].u)
              if (site.maps)
                for (k in site.maps)
                  if (Object.hasOwn(site.maps, k) && site.maps[k].u && Object.hasOwn(site.maps[k].u.tiles, theme)) {
                    for (l in site.maps[k].u.tiles)
                      if (theme !== l && Object.hasOwn(site.maps[k].u.tiles, l))
                        site.maps[k].u.tiles[l].removeFrom(site.maps[k].u.map)
                    site.maps[k].u.tiles[theme].addTo(site.maps[k].u.map)
                  }
            } else if ('hide_url_parameters' === u.setting) {
              window.history.replaceState(
                Date.now(),
                '',
                site.settings.hide_url_parameters
                  ? window.location.protocol + '//' + window.location.host + window.location.pathname
                  : get_options_url()
              )
            } else {
              global_update()
            }
            storage.setItem(u.setting, site[u.setting])
          }
        },
        options: function (u, c) {
          var v,
            i,
            s,
            n,
            ns = 0,
            k,
            d = u.dataset
              ? valueOf(u.dataset)
              : u.view
              ? _u[u.view].get.dataset()
              : valueOf(c.dataset) || defaults.dataset,
            va = valueOf(u.variable)
          if (!Object.hasOwn(u, 'option_sets')) u.option_sets = {}
          u.e.innerHTML = ''
          if (c && Object.hasOwn(u.option_sets, (k = d + (va ? va : '')))) {
            u.values = u.option_sets[k].values
            u.display = u.option_sets[k].display
            if (u.view && ('ID' === u.variable || 'ids' === u.options_source)) {
              for (
                v = site.dataviews[u.view].selection.all, s = u.option_sets[k].options, n = s.length, ns = 0, i = 0;
                i < n;
                i++
              ) {
                u.e.appendChild(s[i])
                if (Object.hasOwn(v, s[i].value)) {
                  s[i].classList.remove('hidden')
                  ns++
                } else {
                  s[i].classList.add('hidden')
                }
              }
            } else {
              for (s = u.option_sets[k].options, n = s.length, i = 0; i < n; i++) {
                u.e.appendChild(s[i])
                ns++
              }
            }
            u.e[ns ? 'removeAttribute' : 'setAttribute']('disabled', true)
          } else {
            if (patterns.variable.test(u.options_source)) {
              d = c.value()
              if (d) fill_variables_options(u, d, u.option_sets)
            } else if (patterns.levels.test(u.options_source)) {
              fill_levels_options(u, d, va, u.option_sets)
            } else if (patterns.ids.test(u.options_source)) {
              fill_ids_options(u, d, u.option_sets)
            }
          }
          u.set(u.value())
        },
        map_colors: function (u) {
          const v = site.dataviews[u.view],
            c = valueOf(u.color || v.y),
            d = v.get.dataset(),
            ys = u.time
              ? _u[u.time]
              : v.time_agg
              ? Object.hasOwn(_u, v.time_agg)
                ? _u[v.time_agg]
                : 'last' === v.time_agg && c && Object.hasOwn(variables[c], u.view)
                ? variables[c][u.view].summaries[d].time_range[1]
                : parseInt(v.time_agg)
              : 0
          if (c && Object.hasOwn(v, 'get')) {
            const p = valueOf(v.palette) || site.settings.palette
            var l,
              o,
              i,
              y = ys.parsed ? ys.value() - meta.time_range[0] : 0,
              s = v.selection.all,
              k,
              n,
              rank
            if (
              site.maps[u.id]._layers &&
              Object.hasOwn(site.maps[u.id]._layers, d) &&
              Object.hasOwn(variables[c], u.view)
            ) {
              l = variables[c][u.view].summaries[d]
              o = variables[c][u.view].order[d][y]
              if (o)
                for (i = o.length, n = v.n_selected.all, rank = n; i--; ) {
                  k = o[i][0]
                  if (Object.hasOwn(s, k) && Object.hasOwn(variables[c], u.view) && s[k].layer[u.id]) {
                    s[k].layer[u.id].setStyle({
                      fillOpacity: 0.7,
                      color: '#000000',
                      fillColor: pal(s[k].data[c][y], p, l, y, n ? rank-- / n - 0.5 : 0),
                      weight: 2,
                    })
                  }
                }
            } else {
              if (!Object.hasOwn(site.maps, '_waiting')) site.maps._waiting = {}
              if (!Object.hasOwn(site.maps._waiting, d)) site.maps._waiting[d] = []
              if (-1 === site.maps._waiting[d].indexOf(u.id)) site.maps._waiting[d].push(u.id)
              if (-1 === site.maps._waiting[d].indexOf(u.view)) site.maps._waiting[d].push(u.view)
            }
          }
        },
        map_shapes: function (u, c, pass) {
          clearTimeout(u.queue)
          if (!pass) {
            u.queue = setTimeout(conditionals.map_shapes.bind(null, u, void 0, true), 20)
          } else {
            if (u.view && u.displaying) {
              const view = site.dataviews[u.view]
              if (!view.valid && init_log[view.get.dataset()]) {
                view.state = ''
                conditionals.dataview(view, void 0, true)
              }
              const vstate = view.value() + site.settings.background_shapes,
                a = view.selection.all,
                s = view.selection[site.settings.background_shapes && u.options.background_shapes ? 'ids' : 'all'],
                bgc = site.settings.theme_dark ? '#666' : '#000'
              var k,
                n = 0,
                fg
              if (s && view.valid && vstate !== u.vstate) {
                u.displaying.clearLayers()
                u.vstate = false
                for (k in s) {
                  fg = Object.hasOwn(a, k)
                  if (
                    Object.hasOwn(s, k) &&
                    s[k].layer &&
                    s[k].layer[u.id] &&
                    (fg || u.options.background_shapes === entities[k].group)
                  ) {
                    s[k].layer[u.id].options.interactive = fg
                    n++
                    s[k].layer[u.id].addTo(u.displaying)
                    if (!fg) {
                      s[k].layer[u.id].bringToBack()
                      s[k].layer[u.id].setStyle({
                        fillOpacity: 0,
                        color: bgc,
                        weight: 1,
                      })
                    }
                    if (!u.vstate) u.vstate = vstate
                  }
                }
              }
              if (n) u.map.flyToBounds(u.displaying.getBounds())
            }
          }
        },
        min: function (u, c) {
          var cv = c.value(),
            uv = u.value(),
            v = _u[u.view || c.view],
            variable
          if (patterns.minmax.test(cv)) cv = c.parsed.min
          if (v && v.y) {
            variable = valueOf(v.y)
            if (Object.hasOwn(variables, variable)) {
              if (!v.time_range.time.length) conditionals.time_range(v, u, true)
              cv = Math.max(v.time_range.time[0], parseFloat(cv))
            }
            u.update()
          }
          u.e.min = 'undefined' === typeof u.parsed.min ? parseFloat(cv) : Math.max(u.parsed.min, parseFloat(cv))
          if (!u.e.value) {
            u.reset()
          } else if ('number' === typeof uv && isFinite(uv) && uv < cv) {
            u.set(cv)
          }
        },
        max: function (u, c) {
          var cv = c.value(),
            uv = u.value(),
            v = _u[u.view || c.view],
            variable
          if (patterns.minmax.test(cv)) cv = c.parsed.max
          if (v && v.y) {
            variable = valueOf(v.y)
            if (Object.hasOwn(variables, variable)) {
              if (!v.time_range.time.length) conditionals.time_range(v, u, true)
              cv = Math.min(v.time_range.time[1], parseFloat(cv))
            }
            u.update()
          }
          u.e.max = 'undefined' === typeof u.parsed.max ? parseFloat(cv) : Math.min(u.parsed.max, parseFloat(cv))
          if (!u.e.value) {
            u.reset()
          } else if ('number' === typeof uv && isFinite(uv) && uv > cv) {
            u.set(cv)
          }
        },
        dataview: function (f) {
          const d = f.get.dataset(),
            state = f.value()
          if (state !== f.state) {
            var c,
              k,
              id,
              first_all = '',
              summary_state = site.settings.summary_selection
            if (init_log[d]) {
              f.valid = true
              f.n_selected.ids = 0
              f.n_selected.features = 0
              f.n_selected.variables = 0
              f.n_selected.dataset = 0
              f.n_selected.filtered = 0
              f.n_selected.all = 0
              f.selection.ids = {}
              f.selection.features = {}
              f.selection.variables = {}
              f.selection.dataset = {}
              f.selection.filtered = {}
              f.selection.all = {}
              for (id in entities)
                if (Object.hasOwn(entities, id)) {
                  c = f.check(entities[id])
                  c.all = 0
                  if (c.ids) {
                    f.selection.ids[id] = entities[id]
                    f.n_selected.ids++
                    c.all++
                  }
                  if (c.features) {
                    f.selection.features[id] = entities[id]
                    f.n_selected.features++
                    c.all++
                  }
                  if (c.variables) {
                    f.selection.variables[id] = entities[id]
                    f.n_selected.variables++
                    c.all++
                  }
                  if (c.dataset) {
                    f.selection.dataset[id] = entities[id]
                    f.n_selected.dataset++
                    c.all++
                  }
                  if (c.features && c.dataset) {
                    f.selection.filtered[id] = entities[id]
                    f.n_selected.filtered++
                  }
                  if (4 === c.all) {
                    if (!first_all) first_all = id
                    f.selection.all[id] = entities[id]
                    f.n_selected.all++
                    summary_state += id
                  }
                }
              if (first_all && summary_state !== f.summary_state) {
                f.summary_state = summary_state
                for (k in variables)
                  if (Object.hasOwn(f.selection.all[first_all].data, k)) calculate_summary(k, f.id, true)
                update_subs(f.id, 'update')
              }
              request_queue(f.id)
            } else {
              f.valid = false
              data_queue[d][f.id] = conditionals.dataview.bind(null, f)
            }
          }
        },
        time_filters: function (u) {
          u.time_range.filtered[0] = Infinity
          u.time_range.filtered[1] = -Infinity
          const s = variables[u.time][u.id].summaries[u.get.dataset()],
            c = _c[u.id + '_filter']
          for (var f, v = {}, pass, i = s.mean.length; i--; ) {
            if (i >= u.time_range.index[0] && i <= u.time_range.index[1]) {
              for (f = u.time_filters.length, pass = false; f--; ) {
                if (!Object.hasOwn(v, u.time_filters[f].value))
                  v[u.time_filters[f].value] = valueOf(u.time_filters[f].value)
                pass = check_funs[u.time_filters[f].type](s.mean[i], v[u.time_filters[f].value])
                if (!pass) break
              }
            } else pass = false
            u.times[i] = pass
            if (pass) {
              if (u.time_range.filtered[0] > s.mean[i]) u.time_range.filtered[0] = s.mean[i]
              if (u.time_range.filtered[1] < s.mean[i]) u.time_range.filtered[1] = s.mean[i]
            }
          }
          if (c)
            for (i = c.length; i--; ) {
              if ('update' === c[i].type) {
                _u[c[i].id].update()
              } else if (Object.hasOwn(conditionals, c[i].type)) {
                conditionals[c[i].type](_u[c[i].id], u)
              }
            }
        },
        time_range: function (u, c, passive) {
          const v = c && c.value(),
            d = u.get.dataset(),
            t = u.time ? variables[valueOf(u.time)].info[d].min : '',
            s = _c[u.id + '_time'],
            variable = Object.hasOwn(variables, v) ? v : valueOf(u.y)
          var r = variables[variable]
          if (r) {
            if (!Object.hasOwn(r, u.id)) init_summaries(u.id)
            r = r[u.id].summaries[d].time_range
            u.time_range.variable = variable
            u.time_range.index[0] = r[0]
            u.time_range.time[0] = u.time_range.filtered[0] = t + r[0]
            u.time_range.index[1] = r[1]
            u.time_range.time[1] = u.time_range.filtered[1] = t + r[1]
            if (!passive && s) {
              for (var i = s.length; i--; ) {
                if ('min' === s[i].type) {
                  if (isFinite(u.time_range.time[0]) && parseFloat(_u[s[i].id].e.min) !== u.time_range.time[0]) {
                    _u[s[i].id].e.min = u.time_range.time[0]
                    if (u.time_range.time[0] > _u[s[i].id].value()) _u[s[i].id].set(u.time_range.time[0])
                  }
                } else if ('max' === s[i].type) {
                  if (isFinite(u.time_range.time[1]) && parseFloat(_u[s[i].id].e.max) !== u.time_range.time[1]) {
                    _u[s[i].id].e.max = u.time_range.time[1]
                    if (u.time_range.time[1] < _u[s[i].id].value()) _u[s[i].id].set(u.time_range.time[1])
                  }
                }
              }
            }
          }
        },
      },
      elements = {
        buttongroup: {
          retrieve: function () {
            for (var i = this.options.length; i--; )
              if (this.options[i].checked) {
                this.set(i)
                break
              }
          },
          setter: function (v) {
            this.previous = this.value()
            this.current_index = 'string' === typeof v ? this.values.indexOf(v) : v
            if (-1 !== this.current_index) {
              this.source = Object.hasOwn(_u, this.values[this.current_index])
                ? _u[this.values[this.current_index]]
                : this.values[this.current_index]
              this.options[this.current_index].checked = true
            } else this.source = undefined
            request_queue(this.id)
          },
          listener: function (e) {
            this.set(e.target.value)
          },
          adder: function (i, value, display) {
            var e = [document.createElement('input'), document.createElement('label')]
            e[0].className = 'btn-check'
            e[0].type = 'radio'
            e[0].name = this.e.id + '_options'
            e[0].autocomplete = 'off'
            e[0].value = value
            e[0].id = this.e.id + '_option' + i
            e[1].className = 'btn btn-primary'
            e[1].innerText = display
            e[1].setAttribute('for', e[0].id)
            this.e.appendChild(e[0])
            this.e.appendChild(e[1])
            return e
          },
        },
        radio: {
          retrieve: function () {
            for (var i = this.options.length; i--; ) {
              if (this.options[i].checked) {
                this.set(i)
                break
              }
            }
          },
          setter: function (v) {
            this.current_index = 'string' === typeof v ? this.values.indexOf(v) : v
            if (-1 !== this.current_index) {
              this.source = Object.hasOwn(_u, this.values[this.current_index])
                ? _u[this.values[this.current_index]]
                : this.values[this.current_index]
              this.options[this.current_index].checked = true
            } else this.source = undefined
            request_queue(this.id)
          },
          listener: function (e) {
            this.set(e.target.value)
          },
          adder: function (value, display) {
            var e = document.createElement('div')
            this.e.appendChild(e)
            e.className = 'form-check'
            e.appendChild(document.createElement('input'))
            e.appendChild(document.createElement('label'))
            e.firstElementChild.class = 'form-check-input'
            e.firstElementChild.type = 'radio'
            e.firstElementChild.name = this.e.id + '_options'
            e.firstElementChild.id = this.e.id + '_option' + this.e.childElementCount
            e.firstElementChild.value = value
            e.lastElementChild.innerText = display
            e.lastElementChild.className = 'form-check-label'
            e.lastElementChild.setAttribute('for', e.firstElementChild.id)
            return this.e
          },
        },
        checkbox: {
          retrieve: function () {
            this.source = []
            this.current_index = []
            for (var i = this.options.length; i--; ) {
              if (this.options[i].checked) {
                this.source.push(this.values[i])
                this.current_index.push(i)
              }
            }
            request_queue(this.id)
          },
          setter: function (v) {
            if ('object' === typeof v) {
              this.source = []
              this.current_index = []
              for (var i = this.values.length; i--; )
                if (-1 !== v.indexOf(this.values[i])) {
                  this.source.push(this.values[i])
                  this.current_index.push(i)
                  this.options[i].checked = true
                } else this.options[i].checked = false
            } else {
              if ('string' === typeof v) {
                return this.set(v.split(','))
              } else {
                if (-1 !== v) this.options[v].checked = true
              }
            }
            request_queue(this.id)
          },
          listener: function (e) {
            if (e.target.checked) {
              this.source.push(e.target.value)
              this.current_index.push(this.values.indexOf(e.target.value))
            } else {
              var i = this.source.indexOf(e.target.value)
              if (i !== -1) {
                this.source.splice(i, 1)
                this.current_index.splice(i, 1)
              }
            }
            request_queue(this.id)
          },
          adder: function (value, display) {
            var e = document.createElement('div')
            this.e.appendChild(e)
            e.className = 'form-check'
            e.appendChild(document.createElement('input'))
            e.appendChild(document.createElement('label'))
            e.firstElementChild.class = 'form-check-input'
            e.firstElementChild.type = 'checkbox'
            e.firstElementChild.name = this.e.id + '_options'
            e.firstElementChild.id = this.e.id + '_option' + this.e.childElementCount
            e.firstElementChild.value = value
            e.lastElementChild.innerText = display
            e.lastElementChild.className = 'form-check-label'
            e.lastElementChild.setAttribute('for', e.firstElementChild.id)
            return this.e
          },
        },
        switch: {
          retrieve: function () {
            this.set(this.e.checked)
          },
          setter: function (v) {
            if ('string' === typeof v) v = 'on' === v
            if (v !== this.source) {
              this.previous = this.e.checked
              this.e.checked = this.source = v
              request_queue(this.id)
            }
          },
          listener: function (e) {
            this.set(e.target.checked)
          },
        },
        number: {
          retrieve: function () {
            this.set(this.e.value)
          },
          setter: function (v) {
            if (!v) v = null
            if ('string' === typeof v) v = parseFloat(v)
            if (isFinite(v) && v !== this.source) {
              this.previous = parseFloat(this.e.value)
              this.e.value = this.source = v
              this.current_index = v - this.parsed.min
              if ('range' === this.e.type) {
                this.e.nextElementSibling.firstElementChild.innerText = this.e.value
              }
              request_queue(this.id)
            }
          },
          listener: function (e) {
            this.set(e.target.value)
          },
        },
        text: {
          init: function (o) {
            if (site.text && Object.hasOwn(site.text, o.id)) {
              o.text = site.text[o.id].text
              o.condition = site.text[o.id].condition || []
              o.depends = {}
              for (var n = o.text.length, i = 0, tn, t, k; i < n; i++) {
                if (Object.hasOwn(o.text[i], 'text')) {
                  init_text(o, o.text[i])
                  o.e.appendChild(o.text[i].parts)
                } else {
                  o.e.appendChild(document.createElement('span'))
                  for (tn = o.text[i].length, t = 0; t < tn; t++) {
                    init_text(o, o.text[i][t])
                  }
                }
              }
              for (i = o.condition.length; i--; )
                if (Object.hasOwn(_u, o.condition[i].id)) add_dependency(o.condition[i].id, {type: 'display', id: o.id})
              for (k in o.depends) if (Object.hasOwn(_u, k)) add_dependency(k, {type: 'update', id: o.id})
              o.update = elements.text.update.bind(o)
            }
            o.update()
          },
          update: function () {
            var k, i, o, t, c, s, pass, bt
            for (k in this.depends)
              if (Object.hasOwn(this.depends, k)) {
                this.depends[k] = valueOf(k)
                if (Object.hasOwn(entities, this.depends[k])) this.depends[k] = entities[this.depends[k]].features.name
              }
            for (i = this.text.length; i--; ) {
              pass = true
              o = this.text[i]
              if (o.length) {
                for (t = o.length; t--; ) {
                  if (Object.hasOwn(o[t], 'condition')) {
                    for (c = o[t].condition.length; c--; ) {
                      pass = o[t].condition[c].check()
                      if (!pass) break
                    }
                    if (pass) {
                      o = o[t]
                      break
                    }
                  }
                }
              } else {
                if (Object.hasOwn(o, 'condition')) {
                  for (t = o.condition.length; t--; ) {
                    pass = o.condition[t].check()
                    if (!pass) break
                  }
                }
              }
              if (pass) {
                for (t = o.text.length; t--; ) {
                  k = o.text[t]
                  if ('object' === typeof k) {
                    for (bt = k.length; bt--; ) {
                      if ('default' === k[bt].id || check_funs[k[bt].type](valueOf(k[bt].id), valueOf(k[bt].value)))
                        k = k[bt].text
                    }
                  }
                  if (Object.hasOwn(this.depends, k)) {
                    o.parts.children[t].innerText = this.depends[k]
                  } else if (Object.hasOwn(o.button, k)) {
                    for (s = '', bt = o.button[k].text.length; bt--; ) {
                      s =
                        (Object.hasOwn(this.depends, o.button[k].text[bt])
                          ? this.depends[o.button[k].text[bt]]
                          : o.button[k].text[bt]) + s
                    }
                    o.parts.children[t].innerText = s
                  } else o.parts.children[t].innerText = k
                }
                if (this.text[i].length) {
                  this.e.children[i].innerHTML = ''
                  this.e.children[i].appendChild(o.parts)
                } else o.parts.classList.remove('hidden')
              } else o.parts.classList.add('hidden')
            }
          },
        },
        select: {
          retrieve: function () {
            this.set(this.e.selectedIndex)
          },
          setter: function (v) {
            if ('string' === typeof v) v = this.values.indexOf(v)
            if (v !== this.e.selectedIndex || this.values[v] !== this.source) {
              this.e.selectedIndex = v
              this.source = this.values[v]
              request_queue(this.id)
            }
          },
          listener: function (e) {
            this.set(e.target.selectedIndex)
          },
          adder: function (value, display, meta) {
            var e = document.createElement('option')
            e.value = value
            e.innerText = display
            if (meta && meta.info) {
              e.title = meta.info.description || meta.info.short_description
            }
            this.e.appendChild(e)
            return e
          },
        },
        plot: {
          init: function (o) {
            if (Object.hasOwn(site.plots, o.id)) {
              var i, p, k, pl, es, en, ei
              o.update = elements.plot.update.bind(o)
              o.x = o.e.getAttribute('x')
              o.y = o.e.getAttribute('y')
              o.color = o.e.getAttribute('color')
              o.time = o.e.getAttribute('color-time')
              o.click = o.e.getAttribute('click')
              if (o.click && Object.hasOwn(_u, o.click)) o.clickto = _u[o.click]
              o.parsed = {}
              o.config = site.plots[o.id]
              o.traces = {}
              if ('tabpanel' === o.e.parentElement.getAttribute('role')) {
                document.getElementById(o.e.parentElement.getAttribute('aria-labelledby')).addEventListener(
                  'click',
                  function () {
                    setTimeout(trigger_resize, 155)
                  }.bind(o)
                )
              }
              o.show = function (e) {
                var trace = make_data_entry(this, e, 0, 'hover_line', site.theme_dark ? '#fff' : '#000')
                if (trace) {
                  trace.line.width = 4
                  trace.marker.size = 12
                  Plotly.addTraces(this.e, trace, this.e.data.length)
                }
              }.bind(o)
              o.revert = function () {
                if ('hover_line' === this.e.data[this.e.data.length - 1].name)
                  Plotly.deleteTraces(this.e, this.e.data.length - 1)
              }.bind(o)
              if (o.config) {
                site.plots[o.id].u = o
                if (o.config.subto) for (i = o.config.subto.length; i--; ) add_subs(o.config.subto[i], o)
              }
              for (i = site.plots[o.id].data.length; i--; ) {
                p = site.plots[o.id].data[i]
                for (k in p)
                  if (Object.hasOwn(p, k) && patterns.period.test(k)) {
                    for (es = k.split('.'), en = es.length, ei = 0, pl = false; ei < en; ei++) {
                      pl = pl ? (pl[es[ei]] = ei === en - 1 ? p[k] : {}) : (p[es[ei]] = {})
                    }
                  }
                if (!Object.hasOwn(p, 'textfont')) p.textfont = {}
                if (!Object.hasOwn(p.textfont, 'color')) p.textfont.color = '#adadad'
                if (!Object.hasOwn(p, 'line')) p.line = {}
                if (!Object.hasOwn(p.line, 'color')) p.line.color = '#adadad'
                if (!Object.hasOwn(p, 'marker')) p.marker = {}
                p.marker.size = 8
                if (!Object.hasOwn(p.marker, 'color')) p.marker.color = '#adadad'
                if (!Object.hasOwn(p.marker, 'line')) p.marker.line = {}
                if (!Object.hasOwn(p.marker.line, 'color')) p.marker.line.color = '#adadad'
                if (!Object.hasOwn(p, 'text')) p.text = []
                if (!Object.hasOwn(p, 'x')) p.x = []
                if ('box' !== p.type && !Object.hasOwn(p, 'y')) p.y = []
                o.traces[site.plots[o.id].data[i].type] = JSON.stringify(site.plots[o.id].data[i])
                if (!i) {
                  o.base_trace = site.plots[o.id].data[i].type
                  if (Object.hasOwn(_u, o.base_trace)) add_dependency(o.base_trace, {type: 'update', id: o.id})
                }
              }
              if (o.x && !Object.hasOwn(variables, o.x)) {
                add_dependency(o.x, {type: 'update', id: o.id})
              }
              if (o.y && !Object.hasOwn(variables, o.y)) {
                add_dependency(o.y, {type: 'update', id: o.id})
              }
              if (o.time && Object.hasOwn(_u, o.time)) {
                add_dependency(o.time, {type: 'update', id: o.id})
              }
              if (o.view) {
                _c[o.view].push({type: 'update', id: o.id})
                _c[o.view + '_filter'].push({type: 'update', id: o.id})
                if (_u[o.view].time_agg && Object.hasOwn(_u, _u[o.view].time_agg))
                  add_dependency(_u[o.view].time_agg, {type: 'update', id: o.id})
              } else o.view = defaults.dataview
              queue_init_plot.bind(o)()
            }
          },
          mouseover: function (d) {
            if (d.points && d.points.length === 1 && this.e.data[d.points[0].fullData.index]) {
              this.e.data[d.points[0].fullData.index].line.width = 4
              // this.e.data[d.points[0].fullData.index].marker.size = 12
              Plotly.react(this.e, this.e.data, this.e.layout)
              update_subs(this.id, 'show', entitiesByName[d.points[0].text])
            }
          },
          mouseout: function (d) {
            if (d.points && d.points.length === 1 && this.e.data[d.points[0].fullData.index]) {
              this.e.data[d.points[0].fullData.index].line.width = 2
              // this.e.data[d.points[0].fullData.index].marker.size = 8
              Plotly.react(this.e, this.e.data, this.e.layout)
              update_subs(this.id, 'revert', entitiesByName[d.points[0].text])
            }
          },
          click: function (d) {
            this.clickto && this.clickto.set(d.points[0].data.id)
          },
          update: function (pass) {
            clearTimeout(this.queue)
            if (!pass) {
              this.queue = setTimeout(this.update.bind(null, true), 20)
            } else {
              if (this.e.layout) {
                const v = _u[this.view],
                  s = v.selection && v.selection.all,
                  d = v.get.dataset(),
                  y = _u[this.time || v.time_agg]
                if (s) {
                  this.parsed.x = valueOf(this.x)
                  this.parsed.y = valueOf(this.y)
                  this.parsed.view = v
                  this.parsed.time = y ? y.value() - meta.time_range[0] : 0
                  this.parsed.palette = valueOf(v.palette) || site.settings.palette
                  this.parsed.color = valueOf(this.color || v.y || this.parsed.y)
                  this.parsed.summary = variables[this.parsed.color][this.view].summaries[d]
                  for (
                    var order = variables[this.parsed.color][this.view].order[d][this.parsed.time],
                      summary = variables[this.parsed.y][this.view].summaries[d],
                      i = order ? order.length : 0,
                      k,
                      b,
                      n = v.n_selected.all,
                      rank = n,
                      traces = [];
                    i--;

                  ) {
                    if (Object.hasOwn(s, order[i][0])) {
                      k = order[i][0]
                      traces.push(make_data_entry(this, s[k], n ? rank-- / n - 0.5 : 0))
                    }
                  }
                  if (site.settings.boxplots && Object.hasOwn(this.traces, 'box') && s[k]) {
                    traces.push((b = JSON.parse(this.traces.box)))
                    b.line.color = site.settings.dark_theme ? '#757575' : '#787878'
                    b.x = s[k].data[this.parsed.x]
                    b.median = summary.median
                    b.q3 = summary.q3
                    b.q1 = summary.q1
                    if (site.settings.iqr_box) {
                      for (b.upperfence = [], b.lowerfence = [], i = b.q1.length; i--; ) {
                        n = (b.q3[i] - b.q1[i]) * 1.5
                        b.q3[i] = Math.max(b.median[i], b.q3[i])
                        b.upperfence[i] = b.q3[i] + n
                        b.q1[i] = Math.min(b.median[i], b.q1[i])
                        b.lowerfence[i] = b.q1[i] - n
                      }
                    } else {
                      b.upperfence = summary.max
                      b.lowerfence = summary.min
                    }
                  }
                  if ('boolean' !== typeof this.e.layout.yaxis.title)
                    this.e.layout.yaxis.title = format_label(this.parsed.y)
                  if ('boolean' !== typeof this.e.layout.xaxis.title)
                    this.e.layout.xaxis.title = format_label(this.parsed.x)
                  if (this.parsed.x === meta.time_variable) {
                    if (this.e.layout.xaxis.autorange) {
                      this.e.layout.xaxis.autorange = false
                      this.e.layout.xaxis.type = 'linear'
                      this.e.layout.xaxis.dtick = 1
                      this.e.layout.xaxis.range = [v.time_range.filtered[0] - 0.5, v.time_range.filtered[1] + 0.5]
                    } else {
                      this.e.layout.xaxis.range[0] = v.time_range.filtered[0] - 0.5
                      this.e.layout.xaxis.range[1] = v.time_range.filtered[1] + 0.5
                    }
                  }
                  Plotly.react(this.e, traces, this.e.layout)
                }
              }
            }
          },
        },
        map: {
          init: function (o) {
            o.options = site.maps[o.id].options
            o.color = o.e.getAttribute('color')
            o.time = o.e.getAttribute('color-time')
            o.click = o.e.getAttribute('click')
            if (o.click && Object.hasOwn(_u, o.click)) o.clickto = _u[o.click]
            o.show = function (e) {
              if (e && e.layer && e.layer[this.id]) {
                e.layer[this.id].setStyle({
                  color: '#ffffff',
                })
                e.layer[this.id].bringToFront()
              }
            }.bind(o)
            o.revert = function (e) {
              if (e && e.layer && e.layer[this.id]) {
                e.layer[this.id].setStyle({
                  color: '#000000',
                })
              }
            }.bind(o)
            if (o.options && o.options.subto)
              for (var i = o.options.subto.length; i--; ) add_subs(o.options.subto[i], o)
            if (o.view) {
              add_dependency(o.view, {type: 'map_colors', id: o.id})
              if (_u[o.view].time_agg && Object.hasOwn(_u, _u[o.view].time_agg))
                add_dependency(_u[o.view].time_agg, {type: 'map_colors', id: o.id})
              if (_u[o.view].y) add_dependency(_u[o.view].y, {type: 'map_colors', id: o.id})
            } else o.view = defaults.dataview
            _c[o.view].push({type: 'map_shapes', id: o.id})
            if (Object.hasOwn(_u, o.color)) add_dependency(o.color, {type: 'map_colors', id: o.id})
            if (o.time) add_dependency(o.time, {type: 'map_colors', id: o.id})
            if (!o.e.style.height) o.e.style.height = o.options.height ? o.options.height : '400px'
            queue_init_map.bind(o)()
          },
          mouseover: function (e) {
            e.target.setStyle({
              color: '#ffffff',
            })
            e.target.bringToFront()
            update_subs(this.id, 'show', entities[e.target.feature.properties[e.target.source.id_property]])
          },
          mouseout: function (e) {
            update_subs(this.id, 'revert')
            e.target.setStyle({
              color: '#000000',
            })
          },
          click: function (e) {
            this.clickto && this.clickto.set(e.target.feature.properties[e.target.source.id_property])
          },
        },
        info: {
          init: function (o) {
            var i, n, h, p
            o.update = elements.info.update.bind(o)
            o.options = site.info[o.id] || {}
            o.view = o.options.dataview || defaults.dataview
            o.depends = {}
            o.has_default = o.options.default && (o.options.default.title || o.options.default.body)
            add_subs(o.view, o)
            if (o.options && o.options.subto) {
              if ('string' === typeof o.options.subto) o.options.subto = [o.options.subto]
              for (i = o.options.subto.length; i--; ) add_subs(o.options.subto[i], o)
            }
            if (o.options.floating) {
              document.body.appendChild(o.e)
              o.e.classList.add('hidden')
              document.addEventListener(
                'mousemove',
                function (e) {
                  if (this.showing) {
                    this.e.style.top = e.clientY + 10 + 'px'
                    this.e.style.left = e.clientX + 10 + 'px'
                  }
                }.bind(o)
              )
            }
            o.show = function (e, u) {
              this.update(e, u)
              this.showing = true
              if (this.options.floating) this.e.classList.remove('hidden')
              if (this.parts.title) {
                if (this.selection) {
                  this.parts.title.base.classList.add('hidden')
                } else this.parts.title.default.classList.add('hidden')
                this.parts.title.temp.classList.remove('hidden')
              }
              if (this.parts.body) {
                if (this.selection) {
                  this.parts.body.base.classList.add('hidden')
                } else this.parts.body.default.classList.add('hidden')
                this.parts.body.temp.classList.remove('hidden')
              }
            }
            o.revert = function () {
              this.showing = false
              if (this.options.floating) {
                this.e.classList.add('hidden')
              } else {
                if (this.parts.title) {
                  if (this.selection) {
                    this.parts.title.base.classList.remove('hidden')
                  } else if (this.has_default) this.parts.title.default.classList.remove('hidden')
                  this.parts.title.temp.classList.add('hidden')
                }
                if (this.parts.body) {
                  if (this.selection) {
                    this.parts.body.base.classList.remove('hidden')
                  } else if (this.has_default) this.parts.body.default.classList.remove('hidden')
                  this.parts.body.temp.classList.add('hidden')
                }
              }
            }
            o.parts = {}
            function parse_part(o, t) {
              const p = {
                parent: o,
                text: t,
                parsed: {},
                ref: true,
                selection: false,
                get: function (entity, caller) {
                  if (this.ref) {
                    if (entity)
                      if (Object.hasOwn(this.parsed, 'features')) {
                        return entity.features[this.parsed.features]
                      } else if (Object.hasOwn(this.parsed, 'data')) {
                        if ('value' === this.text) {
                          this.parsed.data = valueOf(o.options.variable || caller.color || caller.y || _u[o.view].y)
                        } else if (Object.hasOwn(_u, this.text)) this.parsed.data = valueOf(this.text)
                        if (Object.hasOwn(entity.data, this.parsed.data)) {
                          const info = variable_info[this.parsed.data]
                          return (
                            format_value(
                              entity.data[this.parsed.data][this.parent.time],
                              info ? patterns.int_types.test(info.type) : true
                            ) + (info && 'percent' === info.type ? '%' : '')
                          )
                        }
                      }
                    if (Object.hasOwn(this.parsed, 'data')) {
                      return meta.time[this.parent.time]
                    } else if (
                      Object.hasOwn(this.parsed, 'variables') &&
                      (this.value_source || Object.hasOwn(variable_info, this.parent.v))
                    ) {
                      return variable_info[valueOf(this.value_source || this.parent.v)][this.parsed.variables]
                    }
                    return this.text
                  } else return this.text
                },
              }
              if ('value' === t) {
                p.parsed.data = o.options.variable
              } else if (patterns.features.test(t)) {
                p.parsed.features = t.replace(patterns.features, '')
              } else if (patterns.data.test(t)) {
                p.parsed.data = t.replace(patterns.data, '')
              } else if (patterns.variables.test(t)) {
                p.parsed.variables = t.replace(patterns.variables, '')
              } else p.ref = false
              return p
            }
            if (o.options.title) {
              o.parts.title = parse_part(o, o.options.title)
              if (
                Object.hasOwn(o.parts.title.parsed, 'variables') &&
                patterns.measure_name.test(o.parts.title.parsed.variables)
              ) {
                o.parts.title.base = document.createElement('button')
                o.parts.title.base.type = 'button'
                o.parts.title.base.setAttribute('data-bs-toggle', 'modal')
                o.parts.title.base.setAttribute('data-bs-target', '#variable_info_display')
                o.parts.title.base.addEventListener('click', show_variable_info.bind(o))
              } else o.parts.title.base = document.createElement('p')
              o.parts.title.temp = document.createElement('p')
              o.parts.title.default = document.createElement('p')
              o.parts.title.temp.className =
                o.parts.title.base.className =
                o.parts.title.default.className =
                  'info-title hidden'
              if (o.has_default && o.options.default.title) {
                o.e.appendChild(o.parts.title.default)
                o.parts.title.default.innerText = o.options.default.title
              }
              if (!o.parts.title.ref) o.parts.title.base.innerText = o.parts.title.get()
              o.e.appendChild(o.parts.title.base)
              o.e.appendChild(o.parts.title.temp)
              o.parts.title.base.classList.add('hidden')
              o.parts.title.temp.classList.add('hidden')
            }
            if (o.options.body) {
              o.parts.body = {
                base: document.createElement('div'),
                temp: document.createElement('div'),
                default: document.createElement('div'),
                rows: [],
              }
              o.parts.body.temp.className =
                o.parts.body.base.className =
                o.parts.body.default.className =
                  'info-body hidden'
              if (o.has_default && o.options.default.body) o.parts.body.default.innerText = o.options.default.body
              for (n = o.options.body.length, i = 0, h = 0; i < n; i++) {
                o.parts.body.rows[i] = p = {
                  name: parse_part(o, o.options.body[i].name),
                  value: parse_part(o, o.options.body[i].value),
                }
                p.base = document.createElement('div')
                o.parts.body.base.appendChild(p.base)
                p.temp = document.createElement('div')
                o.parts.body.temp.appendChild(p.temp)
                p.temp.className = p.base.className = 'info-body-row-' + o.options.body[i].style
                h += 24 + ('stack' === o.options.body[i].style ? 24 : 0)
                if (p.name) {
                  if (
                    o.options.variable_info &&
                    Object.hasOwn(p.name.parsed, 'variables') &&
                    patterns.measure_name.test(p.name.parsed.variables)
                  ) {
                    p.base.appendChild(document.createElement('button'))
                    p.base.lastElementChild.type = 'button'
                    p.base.lastElementChild.setAttribute('data-bs-toggle', 'modal')
                    p.base.lastElementChild.setAttribute('data-bs-target', '#variable_info_display')
                    p.base.lastElementChild.addEventListener('click', show_variable_info.bind(o))
                  } else p.base.appendChild(document.createElement('div'))
                  p.temp.appendChild(document.createElement('div'))
                  p.temp.lastElementChild.className = p.base.lastElementChild.className = 'info-body-row-name'
                  p.temp.lastElementChild.innerText = p.base.lastElementChild.innerText = p.name.get()
                }
                if (p.value) {
                  p.base.appendChild(document.createElement('div'))
                  p.temp.appendChild(document.createElement('div'))
                  p.temp.lastElementChild.className = p.base.lastElementChild.className =
                    'info-body-row-value' + ('statement' === p.value.parsed.variables ? ' statement' : '')
                  if (!p.value.ref)
                    p.temp.lastElementChild.innerText = p.base.lastElementChild.innerText = p.value.get()
                }
              }
              o.e.style.minHeight = h + 'px'
              o.e.appendChild(o.parts.body.base)
              o.e.appendChild(o.parts.body.default)
              o.e.appendChild(o.parts.body.temp)
            }
            o.update()
          },
          update: function (entity, caller, pass) {
            const v = site.dataviews[this.view]
            var p,
              e,
              i,
              n,
              ci,
              k,
              y = _u[v.time_agg]
            this.v = valueOf(this.options.variable || (caller && (caller.color || caller.y)) || v.y)
            this.dataset = v.get.dataset()
            this.time = y ? y.value() - meta.time_range[0] : 0
            if (!this.processed) {
              this.processed = true
              if (this.view) {
                add_dependency(this.view, {type: 'update', id: this.id})
                if (y) add_dependency(v.time_agg, {type: 'update', id: this.id})
              } else this.view = defaults.dataview
              if (this.parts.body)
                for (i = this.parts.body.rows.length; i--; ) {
                  p = this.parts.body.rows[i]
                  if (!p.value.ref) {
                    if (Object.hasOwn(_u, p.value.text)) {
                      if (Object.hasOwn(p.name.parsed, 'variables')) {
                        p.name.value_source = p.value.value_source = p.value.text
                        p.value.ref = true
                        p.value.parsed.data = ''
                      }
                    }
                  }
                }
            }
            if (entity) {
              // hover information
              if (this.parts.title) {
                this.parts.title.temp.innerText = this.parts.title.get(entity, caller)
              }
              if (this.parts.body) {
                for (i = this.parts.body.rows.length; i--; ) {
                  p = this.parts.body.rows[i]
                  if (p.name.ref) {
                    if (p.name.value_source) p.name.value_source = p.value.text
                    e = p.name.get(entity, caller)
                    if ('object' !== typeof e) {
                      p.temp.firstElementChild.innerText = parse_variables(e, p.value.parsed.variables, this, entity)
                    }
                  }
                  if (p.value.ref) {
                    if (p.value.value_source) p.value.value_source = p.value.text
                    e = p.value.get(entity, caller)
                    if ('object' !== typeof e) {
                      p.temp.lastElementChild.innerText = parse_variables(e, p.value.parsed.variables, this, entity)
                    }
                  }
                }
              }
            } else if (!this.options.floating) {
              clearTimeout(this.queue)
              if (!pass) {
                this.queue = setTimeout(this.update.bind(null, void 0, void 0, true), 20)
              } else {
                // base information
                if (v.ids && (k = v.get.ids()) && '-1' !== k) {
                  // when showing a selected region
                  this.selection = true
                  entity = entities[k]
                  if (this.parts.title) {
                    if (this.parts.title.value_source) p.title.value_source = p.value.text
                    this.parts.title.base.classList.remove('hidden')
                    this.parts.title.default.classList.add('hidden')
                  }
                  if (this.parts.body && this.has_default) this.parts.body.default.classList.add('hidden')
                } else {
                  // when no ID is selected
                  this.selection = false
                  if (this.parts.title) {
                    if (this.has_default) {
                      this.parts.title.base.classList.add('hidden')
                      this.parts.title.default.classList.remove('hidden')
                    } else this.parts.title.base.classList.remove('hidden')
                  }
                  if (this.parts.body) {
                    this.parts.body.base.classList.add('hidden')
                    if (this.has_default) this.parts.body.default.classList.remove('hidden')
                  }
                }
                if (this.parts.title) {
                  this.parts.title.base.innerText = this.parts.title.get(entity, caller)
                }
                if (this.parts.body) {
                  if (!this.options.subto) this.parts.body.base.classList.remove('hidden')
                  for (i = this.parts.body.rows.length; i--; ) {
                    p = this.parts.body.rows[i]
                    if (Object.hasOwn(p.value.parsed, 'variables') && !Object.hasOwn(this.depends, v.y)) {
                      this.depends[v.y] = true
                      add_dependency(v.y, {type: 'update', id: this.id})
                    }
                    if (p.name.ref) {
                      if (p.name.value_source) p.name.value_source = p.value.text
                      e = p.name.get(entity, caller)
                      if ('object' !== typeof e) {
                        p.base.firstElementChild.innerText = e
                      }
                    }
                    if (p.value.ref) {
                      e = p.value.get(entity, caller)
                      if ('object' === typeof e) {
                        if ('source' === p.value.parsed.variables) {
                          p.base.innerHTML = ''
                          p.base.appendChild(document.createElement('table'))
                          p.base.lastElementChild.className = 'source-table'
                          p.base.firstElementChild.appendChild(document.createElement('thead'))
                          p.base.firstElementChild.firstElementChild.appendChild(document.createElement('tr'))
                          p.base.firstElementChild.firstElementChild.firstElementChild.appendChild(
                            document.createElement('th')
                          )
                          p.base.firstElementChild.firstElementChild.firstElementChild.appendChild(
                            document.createElement('th')
                          )
                          p.base.firstElementChild.firstElementChild.firstElementChild.firstElementChild.innerText =
                            'Source'
                          p.base.firstElementChild.firstElementChild.firstElementChild.lastElementChild.innerText =
                            'Accessed'
                          p.base.firstElementChild.appendChild(document.createElement('tbody'))
                          for (n = e.length, ci = 0; ci < n; ci++) {
                            p.base.firstElementChild.lastElementChild.appendChild(make_variable_source(e[ci]))
                          }
                        }
                      } else {
                        p.base.lastElementChild.innerText = parse_variables(e, p.value.parsed.variables, this, entity)
                      }
                    }
                  }
                }
              }
            }
            this.revert()
          },
        },
        table: {
          init: function (o) {
            var k, n, i, c
            o.e.appendChild(document.createElement('tHead'))
            o.e.appendChild(document.createElement('tBody'))
            o.options = (site.tables && site.tables[o.id]) || {}
            o.features = o.options.features
            o.update = elements.table.update.bind(o)
            o.header = []
            if (!o.dataset) o.dataset = defaults.dataset
            if ('tabpanel' === o.e.parentElement.getAttribute('role')) {
              document.getElementById(o.e.parentElement.getAttribute('aria-labelledby')).addEventListener(
                'click',
                function () {
                  setTimeout(this.update, 155)
                }.bind(o)
              )
            }
            o.options.variable_source = o.options.variables
            if (o.options.variables) {
              if ('string' === typeof o.options.variables) {
                if (Object.hasOwn(_u, o.options.variables)) {
                  add_dependency(o.options.variables, {type: 'update', id: o.id})
                  o.options.variables = valueOf(o.options.variables)
                  o.options.single_variable = 'string' === typeof o.options.variables
                } else if (!o.options.single_variable) {
                  o.options.single_variable = [{name: o.options.single_variable}]
                }
              }
            } else o.options.variables = Object.keys(variables)
            if (
              'string' !== typeof o.options.variables &&
              o.options.variables.length &&
              'string' === o.options.variables[0]
            ) {
              for (i = o.options.variables.length; i--; ) o.options.variables[i] = {name: o.options.variables[i]}
            }
            if (o.options.single_variable) {
              c = o.options.variables
              k = c.name || c
              if (!Object.hasOwn(o.options, 'order')) o.options.order = [[meta.time_n, 'asc']]
              o.header.push({title: 'Name', data: 'features.name'})
              if (1 === meta.time_n) o.variable_header = true
              for (n = meta.time_n; n--; ) {
                o.header[n + 1] = {
                  title: o.variable_header ? c.title || format_label(k) : meta.time[n] + '',
                  data: 'data.' + k.replace(patterns.all_periods, '\\.'),
                  render: function (d) {
                    var k = valueOf(this.v.variables),
                      p = variables[k].datasets[0]
                    return d
                      ? 'number' === typeof d[this.n]
                        ? format_value(d[this.n], 'integer' === variables[k].info[p].type)
                        : d[this.n]
                      : 'NA'
                  }.bind({n, v: o.options}),
                }
              }
            } else if (o.options.wide) {
              if (o.features) {
                if ('string' === typeof o.features) o.features = [{name: o.features}]
                for (n = o.features.length, i = 0; i < n; i++) {
                  o.header.push({
                    title: o.features[i].title || o.features[i].name,
                    data: 'features.' + o.features[i].name.replace(patterns.all_periods, '\\.'),
                  })
                }
              }
              for (i = o.options.variables.length; i--; ) {
                if ('string' === typeof o.options.variables[i]) o.options.variables[i] = {name: o.options.variables[i]}
                c = o.options.variables[i]
                if (!c.source) c.source = Object.hasOwn(variables, c.name) ? 'data' : 'features'
                o.header.push(
                  'features' === c.source
                    ? {
                        title: c.title || format_label(c.name),
                        data: 'features.' + c.name.toLowerCase().replace(patterns.all_periods, '\\.'),
                      }
                    : {
                        title: c.title || format_label(c.name),
                        data: c.source + '.' + c.name.replace(patterns.all_periods, '\\.'),
                        render: function (d) {
                          const i = 'data' === this.c.source ? this.o.i : this.o.v
                          return d ? ('number' === typeof d[i] ? format_value(d[i], false) : d[i]) : 'NA'
                        }.bind({o, c}),
                      }
                )
              }
            } else {
              o.filters = o.options.filters
              o.current_filter = {}
              if (meta.time_n > 1) {
                o.header.push({
                  title: 'Year',
                  data: 'data.time',
                  render: function (d) {
                    return 'number' === typeof d[this.i] ? format_value(d[this.i], true) : d[this.i]
                  }.bind(o),
                })
              }
              if (o.features) {
                if ('string' === typeof o.features) o.features = [{name: o.features}]
                for (i = o.features.length; i--; ) {
                  o.header.splice(0, 0, {
                    title: o.features[i].title || o.features[i].name,
                    data: 'features.' + o.features[i].name.replace(patterns.all_periods, '\\.'),
                  })
                }
              }
              o.header.push({
                title: 'Variable',
                data: function (d) {
                  return Object.hasOwn(d.variables, this.v) ? d.variables[this.v].short_name : this.v
                }.bind(o),
              })
              o.header.push({
                title: 'Value',
                data: function (d) {
                  return Object.hasOwn(d.data, this.v) ? d.data[this.v] : []
                }.bind(o),
                render: function (d) {
                  return d && d.length
                    ? 'number' === typeof d[this.i]
                      ? format_value(
                          d[this.i],
                          'integer' === variables[this.v].info[variables[this.v].datasets[0]].type
                        )
                      : d[this.i]
                    : ''
                }.bind(o),
              })
            }
            if (o.view) {
              _c[o.view].push({type: 'update', id: o.id})
              _c[o.view + '_filter'].push({type: 'update', id: o.id})
            } else o.view = defaults.dataview
            queue_init_table.bind(o)()
          },
          update: function (pass) {
            clearTimeout(this.queue)
            if (!pass) {
              this.queue = setTimeout(this.update.bind(null, true), 20)
            } else {
              if (this.table) {
                const v = _u[this.view]
                this.table.clear()
                if (v.selection) {
                  var k, c, i, ci, n, vn
                  if (this.options.single_variable) {
                    vn = valueOf(this.options.variable_source).replace(patterns.all_periods, '\\.')
                    if ('data.' + vn !== this.header[1].data) {
                      this.table.destroy()
                      for (n = this.header.length, i = 1; i < n; i++) {
                        if (this.variable_header)
                          this.header[i].title = variables[vn] ? variables[vn].meta.short_name : format_label(vn)
                        this.header[i].data = 'data.' + vn
                      }
                      this.options.columns = this.header
                      this.table = $(this.e).DataTable(this.options)
                    }
                    for (n = this.header.length, i = 1; i < n; i++) {
                      this.table.column(i).visible(v.times[i - 1])
                    }
                  }
                  if (this.options.wide) {
                    for (k in v.selection.all)
                      if (Object.hasOwn(v.selection.all, k)) {
                        if (vn) {
                          if (Object.hasOwn(v.selection.all[k].summary, vn) && v.selection.all[k].summary[vn].n)
                            this.table.row.add(v.selection.all[k])
                        } else {
                          for (i = meta.time_n; i--; ) {
                            this.i = i
                            this.table.row.add(v.selection.all[k])
                          }
                        }
                      }
                  } else {
                    for (k in v.selection.all)
                      if (Object.hasOwn(v.selection.all, k)) {
                        if (this.options.single_variable) {
                          if (Object.hasOwn(v.selection.all[k].summary, vn) && v.selection.all[k].summary[vn].n)
                            this.table.row.add(v.selection.all[k])
                        } else {
                          for (c in this.filters)
                            if (Object.hasOwn(this.filters, c)) {
                              this.current_filter[c] = valueOf(this.filters[c])
                            }
                          for (i = this.options.variables.length; i--; ) {
                            vn = this.options.variables[i].name || this.options.variables[i]
                            pass = false
                            if (Object.hasOwn(variables, vn) && Object.hasOwn(variables[vn], 'meta')) {
                              if (this.options.filters) {
                                for (c in this.current_filter)
                                  if (Object.hasOwn(variables[vn].meta, c)) {
                                    pass = variables[vn].meta[c] === this.current_filter[c]
                                    if (!pass) break
                                  }
                              } else pass = true
                            }
                            if (pass) {
                              if (
                                Object.hasOwn(v.selection.all[k].summary, vn) &&
                                v.selection.all[k].summary[vn].time_range[1]
                              ) {
                                for (
                                  n = v.selection.all[k].summary[vn].time_range[1],
                                    ci = v.selection.all[k].summary[vn].time_range[0];
                                  ci <= n;
                                  ci++
                                ) {
                                  this.i = ci
                                  this.v = vn
                                  this.table.row.add(v.selection.all[k])
                                }
                              } else {
                                this.i = 0
                                this.v = vn
                                this.table.row.add(v.selection.all[k])
                              }
                            }
                          }
                        }
                      }
                  }
                }
                this.table.draw()
              }
            }
          },
        },
        legend: {
          update: function (e) {
            e.innerHTML = ''
            const ep = valueOf(e.parentElement.getAttribute('palette')).toLowerCase(),
              p = palettes[Object.hasOwn(palettes, ep) ? ep : site.settings.palette]
            for (var i = 0, n = p.length; i < n; i++) {
              e.appendChild(document.createElement('span'))
              e.lastElementChild.style.background = p[i]
            }
          },
        },
        credits: {
          init: function (o) {
            var s = site.credit_output && site.credit_output[o.id],
              k,
              e
            o.exclude = []
            o.add = {}
            o.exclude = s && s.exclude ? s.exclude : []
            o.add = s && s.add ? s.add : {}
            o.e.appendChild(document.createElement('ul'))
            for (k in site.credits)
              if (Object.hasOwn(site.credits, k) && -1 === o.exclude.indexOf(k)) {
                o.e.lastElementChild.appendChild((e = document.createElement('li')))
                if (Object.hasOwn(site.credits[k], 'url')) {
                  e.appendChild((e = document.createElement('a')))
                  e.href = site.credits[k].url
                  e.target = '_blank'
                  e.rel = 'noreferrer'
                }
                e.innerText = site.credits[k].name
                if (Object.hasOwn(site.credits[k], 'version')) {
                  e.appendChild(document.createElement('span'))
                  e.lastElementChild.className = 'version-tag'
                  e.lastElementChild.innerText = site.credits[k].version
                }
                if (Object.hasOwn(site.credits[k], 'description')) {
                  e.parentElement.appendChild(document.createElement('p'))
                  e.parentElement.lastElementChild.innerText = site.credits[k].description
                }
              }
          },
        },
      },
      check_funs = {
        '!': function (a) {
          return !a || -1 == a
        },
        '': function (a) {
          return !!a && -1 != a
        },
        '=': function (a, b) {
          return a === b
        },
        '!=': function (a, b) {
          return a != b
        },
        '>': function (a, b) {
          return a > b
        },
        '<': function (a, b) {
          return a < b
        },
        '>=': function (a, b) {
          return a >= b
        },
        '<=': function (a, b) {
          return a <= b
        },
        equals: function (s, e) {
          return !s || -1 == s || s === e
        },
        includes: function (s, e) {
          return !s.length || -1 !== s.indexOf(e)
        },
        sort_a1: function (a, b) {
          return isNaN(a[1]) ? (isNaN(b[1]) ? 0 : -1) : isNaN(b[1]) ? 1 : a[1] - b[1]
        },
        sort_tree_children: function (a, b) {
          return !Object.hasOwn(tree, a.id) || !Object.hasOwn(tree, b.id)
            ? -Infinity
            : tree[a.id]._n.children - tree[b.id]._n.children
        },
      },
      storage = window.localStorage || {
        setItem: function () {},
        getItem: function () {},
        removeItem: function () {},
      }

    const page = {
        navbar: document.getElementsByClassName('navbar')[0],
        content: document.getElementsByClassName('content')[0],
        menus: document.getElementsByClassName('menu-wrapper'),
      },
      variables = {},
      variable_info = {},
      queue = {_timeout: 0},
      defaults = {dataview: 'default_view'},
      data_queue = {},
      data_loaded = {},
      init_log = {},
      meta = {
        time_n: 0,
        time_range: [],
        time: [],
        time_variable: '',
      },
      subs = {},
      data_maps = {},
      entities = {},
      entitiesByName = {},
      rule_conditions = {},
      _u = {},
      _c = {},
      tree = {}

    document.body.className =
      (window.localStorage && 'true' === window.localStorage.getItem('theme_dark')) || site.settings.theme_dark
        ? 'dark-theme'
        : 'light-theme'
    if (page.content) {
      var i = page.menus.length,
        h = page.navbar ? page.navbar.getBoundingClientRect().height : 0
      for (; i--; )
        if (page.menus[i].classList.contains('menu-top')) {
          h = page.menus[i].getBoundingClientRect().height
          break
        }
      page.content.style.top = h + 'px'
    }

    function pal(value, which, summary, index, rank) {
      which = which ? which.toLowerCase() : site.settings.palette
      const colors = palettes[Object.hasOwn(palettes, which) ? which : 'reds'],
        string = summary && Object.hasOwn(summary, 'levels'),
        min = summary && !string ? summary.min[index] : 0,
        max = summary ? (string ? summary.levels.length : summary.max[index]) : 1,
        nm = summary && !string ? (isNaN(summary.norm_median[index]) ? 0 : summary.norm_median[index]) : 0.5
      return (string ? Object.hasOwn(summary.level_ids, value) : 'number' === typeof value)
        ? colors[
            Math.max(
              0,
              Math.min(
                colors.length - 1,
                Math.floor(
                  colors.length / 2 +
                    colors.length *
                      (site.settings.color_by_order
                        ? rank
                        : max - min
                        ? ((string ? summary.level_ids[value] : value) - min) / (max - min) - nm
                        : 0)
                )
              )
            )
          ]
        : '#f0f0f040'
    }

    function init_text(o, text) {
      if (!Object.hasOwn(text, 'button')) text.button = {}
      if ('string' === typeof text.text) text.text = [text.text]
      text.parts = document.createElement('span')
      for (var n = text.text.length, i = 0, p; i < n; i++) {
        if (Object.hasOwn(text.button, text.text[i])) {
          p = text.button[text.text[i]]
          text.parts.appendChild(document.createElement('button'))
          text.parts.lastElementChild.type = 'button'
          text.parts.lastElementChild.className = 'btn btn-link'
          if (Object.hasOwn(_u, p.target) && 'function' === typeof _u[p.target][p.type]) {
            text.parts.lastElementChild.setAttribute('aria-label', p.text.join(''))
            text.parts.lastElementChild.addEventListener('click', _u[p.target][p.type])
          }
        } else {
          text.parts.appendChild(document.createElement('span'))
        }
      }
      if (Object.hasOwn(text, 'condition')) {
        for (i = text.condition.length; i--; )
          if (text.condition[i].id) {
            if ('default' === text.condition[i].id) {
              text.condition[i].check = function () {
                return true
              }
            } else {
              o.depends[text.condition[i].id] = ''
              text.condition[i].check = function () {
                return 'default' === this.id || check_funs[this.type](valueOf(this.id), valueOf(this.value))
              }.bind(text.condition[i])
            }
          }
      }
    }

    function format_value(v, int) {
      if (!int && 'number' === typeof v) {
        if (site.settings.digits > 0) {
          const d = Math.pow(10, site.settings.digits),
            r = Math.round((v % 1) * d) / d + ''
          return (
            (v < 0 ? '-' : '') +
            (Math.abs(v) >> 0) +
            '.' +
            ((patterns.period.test(r) ? r.split('.')[1] : '') + '0000000000').substring(0, site.settings.digits)
          )
        } else return Math.round(v)
      } else {
        return v
      }
    }

    function format_label(l) {
      return Object.hasOwn(variables, l) && variables[l].meta && variables[l].meta.short_name
        ? variables[l].meta.short_name
        : l.replace(patterns.seps, ' ').replace(patterns.word_start, function (w) {
            return w.toUpperCase()
          })
    }

    function fill_ids_options(u, d, out) {
      if (!Object.hasOwn(data_maps, d)) {
        data_queue[d][u.id] = fill_ids_options.bind(null, u, d, out)
        return
      }
      var s, k
      out[d] = {options: [], values: [], display: []}
      s = out[d].options
      u.values = out[d].values
      u.display = out[d].display
      for (k in entities)
        if (Object.hasOwn(entities, k) && d === entities[k].group) {
          s.push(u.add(k, entities[k].features.name))
          u.values.push(k)
          u.display.push(entities[k].features.name)
        }
      site.url_options[u.id] ? u.set(site.url_options[u.id]) : u.reset()
    }

    function fill_variables_options(u, d, out) {
      var s, i, m, n, l
      out[d] = {options: [], values: [], display: []}
      s = out[d].options
      u.values = out[d].values
      u.display = out[d].display
      for (m = site.metadata.info[d].schema.fields, n = m.length, i = 0; i < n; i++) {
        l = format_label(m[i].name)
        s[i] = u.add(i, l, m[i])
        u.values.push(m[i].name)
        u.display.push(l)
      }
      site.url_options[u.id] ? u.set(site.url_options[u.id]) : u.reset()
    }

    function fill_levels_options(u, d, v, out) {
      const m = variables[v].info[d],
        t = 'string' === m.type ? 'levels' : 'ids'
      var l = m[t],
        k,
        i,
        n,
        s
      if (l) {
        k = d + v
        if (Object.hasOwn(out, k)) {
          u.values = out[k].values
          u.display = out[k].display
          for (s = out[k].options, n = s.length, i = 0; i < n; i++) {
            if (s[i].length) {
              u.e.appendChild(s[i][0])
              u.e.appendChild(s[i][1])
            } else u.e.appendChild(s[i])
          }
        } else {
          out[k] = {options: [], values: [], display: []}
          s = out[k].options
          u.values = out[k].values
          u.display = out[k].display
          i = 0
          for (k in l)
            if (Object.hasOwn(l, k)) {
              s[i++] = u.add(l[k].id, l[k].name)
              u.values.push(l[k].id)
              u.display.push(l[k].name)
            }
        }
      } else if ('ids' === t) {
        data_queue[d][u.id] = fill_levels_options.bind(null, u, d, v, out)
      }
      site.url_options[u.id] ? u.set(site.url_options[u.id]) : u.reset()
    }

    function add_dependency(id, o) {
      if (!Object.hasOwn(_c, id)) _c[id] = []
      _c[id].push(o)
      if (!Object.hasOwn(tree, id)) tree[id] = {_n: {children: 0, parents: 0}, children: {}, parents: {}}
      if (!Object.hasOwn(tree, o.id)) tree[o.id] = {_n: {children: 0, parents: 0}, children: {}, parents: {}}
      tree[id].children[o.id] = tree[o.id]
      tree[id]._n.children++
      tree[o.id].parents[id] = tree[id]
      tree[o.id]._n.parents++
      _c[id].sort(check_funs.sort_tree_children)
      request_queue(id)
    }

    function add_subs(id, o) {
      if (!Object.hasOwn(subs, id)) subs[id] = []
      subs[id].push(o)
    }

    function update_subs(id, fun, e) {
      if (Object.hasOwn(subs, id)) {
        for (var i = subs[id].length; i--; ) {
          if (Object.hasOwn(subs[id][i], fun)) subs[id][i][fun](e, _u[id])
        }
      }
    }

    function update_plot_theme(u) {
      if (u.dark_theme !== site.settings.theme_dark) {
        u.dark_theme = site.settings.theme_dark
        const s = getComputedStyle(document.body)
        if (!Object.hasOwn(u, 'style')) {
          u.style = u.config.layout
          if (!Object.hasOwn(u.style, 'font')) u.style.font = {}
          if (!Object.hasOwn(u.style, 'modebar')) u.style.modebar = {}
          if (!Object.hasOwn(u.style.xaxis, 'font')) u.style.xaxis.font = {}
          if (!Object.hasOwn(u.style.yaxis, 'font')) u.style.yaxis.font = {}
        }
        u.style.paper_bgcolor = s.backgroundColor
        u.style.plot_bgcolor = s.backgroundColor
        u.style.font.color = s.color
        u.style.modebar.bgcolor = s.backgroundColor
        u.style.modebar.color = s.color
        if (u.e._fullLayout.xaxis.showgrid) u.style.xaxis.gridcolor = s.borderColor
        if (u.e._fullLayout.yaxis.showgrid) u.style.yaxis.gridcolor = s.borderColor
        u.style.xaxis.font.color = s.color
        u.style.yaxis.font.color = s.color
        Plotly.relayout(u.e, u.config.layout)
      }
    }

    function make_data_entry(u, e, rank, name, color) {
      for (
        var i = Object.hasOwn(e.data, u.parsed.x) ? e.data[u.parsed.x].length : 0,
          t = JSON.parse(u.traces[u.base_trace]);
        i--;

      ) {
        t.text[i] = e.features.name
        t.x[i] = e.data[u.parsed.x][i]
        t.y[i] = e.data[u.parsed.y][i]
      }
      t.type = valueOf(t.type)
      t.color =
        t.line.color =
        t.marker.color =
        t.textfont.color =
          color ||
          pal(e.data[u.parsed.color][u.parsed.time], u.parsed.palette, u.parsed.summary, u.parsed.time, rank) ||
          '#adadad'
      if ('bar' === t.type) t.marker.line.width = 0
      t.name = name || e.features.name
      t.id = e.features.id
      return t
    }

    function make_variable_source(s) {
      var e = document.createElement('tr')
      if (s.name) {
        e.appendChild(document.createElement('td'))
        if (s.url) {
          e.firstElementChild.appendChild(document.createElement('a'))
          e.firstElementChild.firstElementChild.target = '_blank'
          e.firstElementChild.firstElementChild.rel = 'noreferrer'
          e.firstElementChild.firstElementChild.href = s.url
        } else {
          e.firstElementChild.appendChild(document.createElement('span'))
        }
        e.firstElementChild.firstElementChild.innerText = s.name
      }
      if (s.date_accessed) {
        e.appendChild(document.createElement('td'))
        e.lastElementChild.appendChild(document.createElement('span'))
        e.lastElementChild.firstElementChild.innerText = s.date_accessed
      }
      return e
    }

    function make_variable_reference(c) {
      for (
        var e = document.createElement('li'), s = '', i = c.author.length, j = 1 === i ? '' : 2 === i ? ' & ' : ', & ';
        i--;

      ) {
        s = (i ? j : '') + c.author[i].family + ', ' + c.author[i].given.substring(0, 1) + '.' + s
        j = ', '
      }
      e.innerHTML =
        s +
        ' (' +
        c.year +
        '). ' +
        c.title +
        '. <em>' +
        c.journal +
        (c.volume ? ', ' + c.volume : '') +
        '</em>' +
        (c.page ? ', ' + c.page : '') +
        '.' +
        (c.doi || c.url
          ? (c.doi ? ' doi: ' : ' url: ') +
            (c.doi || c.url
              ? '<a rel="noreferrer" target="_blank" href="' +
                (c.doi ? 'https://doi.org/' + c.doi : c.url) +
                '">' +
                (c.doi || c.url.replace(patterns.http, '')) +
                '</a>'
              : '')
          : '')
      return e
    }

    function show_variable_info() {
      const v = _u[this.view],
        info = variable_info[valueOf(this.v || v.y)]
      var n, i
      page.modal.info.header.firstElementChild.innerText = info.short_name
      page.modal.info.title.innerText = info.long_name
      page.modal.info.description.innerText = info.long_description || info.description || info.short_description || ''
      page.modal.info.name.lastElementChild.innerText = info.measure || ''
      page.modal.info.type.lastElementChild.innerText = info.type || ''
      if (info.source && info.source.length) {
        page.modal.info.source.lastElementChild.lastElementChild.innerHTML = ''
        page.modal.info.source.classList.remove('hidden')
        for (n = info.source.length, i = 0; i < n; i++) {
          page.modal.info.source.lastElementChild.lastElementChild.appendChild(make_variable_source(info.source[i]))
        }
      } else page.modal.info.source.classList.add('hidden')
      if (info.citations && info.citations.length) {
        page.modal.info.references.lastElementChild.innerHTML = ''
        page.modal.info.references.classList.remove('hidden')
        if ('string' === typeof info.citations) info.citations = [info.citations]
        for (n = info.citations.length, i = 0; i < n; i++)
          if (variable_info._references && Object.hasOwn(variable_info._references, info.citations[i])) {
            page.modal.info.references.lastElementChild.appendChild(
              variable_info._references[info.citations[i]].element
            )
          }
      } else page.modal.info.references.classList.add('hidden')
    }

    function parse_variables(s, type, e, entity) {
      if ('statement' === type) {
        for (var m; (m = patterns.mustache.exec(s)); ) {
          if ('value' === m[1]) {
            s = s.replace(
              m[0],
              entity
                ? format_value(entity.data[e.v][e.time], patterns.int_types.test(variable_info[e.v].type)) +
                    ('percent' === variable_info[e.v].type ? '%' : '')
                : 'unknown'
            )
            patterns.mustache.lastIndex = 0
          } else if (entity) {
            if (patterns.features.test(m[1])) {
              s = s.replace(m[0], entity.features[m[1].replace(patterns.features, '')])
              patterns.mustache.lastIndex = 0
            } else if (patterns.variables.test(m[1])) {
              s = s.replace(m[0], entity.variables[e.v][m[1].replace(patterns.variables, '')])
              patterns.mustache.lastIndex = 0
            } else if (patterns.data.test(m[1])) {
              s = s.replace(m[0], entity.data[e.v][m[1].replace(patterns.data, '')][e.time])
              patterns.mustache.lastIndex = 0
            }
          }
        }
      }
      return s
    }

    window.onload = function () {
      var k, i, e, c, p, ci, n, o
      if (site && site.metadata) map_variables()
      page.navbar = document.getElementsByClassName('navbar')[0]
      page.navbar = page.navbar ? page.navbar.getBoundingClientRect() : {height: 0}
      page.content = document.getElementsByClassName('content')[0]
      page.menus = document.getElementsByClassName('menu-wrapper')
      page.content_bounds = {
        top: page.navbar.height,
        right: 0,
        bottom: 0,
        left: 0,
      }
      page.menu_toggler = {
        hide: function () {
          this.classList.add('hidden')
          trigger_resize()
        },
        toggle: function (type) {
          clearTimeout(page.menu_toggler.timeout)
          if ('closed' === this.parentElement.state) {
            this.parentElement.state = 'open'
            this.parentElement.firstElementChild.classList.remove('hidden')
            this.parentElement.style[type] = '0px'
            page.content.style[type] =
              this.parentElement.getBoundingClientRect()['left' === type || 'right' === type ? 'width' : 'height'] +
              'px'
            setTimeout(trigger_resize, 300)
          } else {
            this.parentElement.state = 'closed'
            if ('left' === type || 'right' === type) {
              this.parentElement.style[type] = -this.parentElement.getBoundingClientRect().width + 'px'
              page.content.style[type] = page.content_bounds[type] + 'px'
            } else {
              page.content.style[type] = page.content_bounds[type] + ('top' === type ? 40 : 0) + 'px'
              this.parentElement.style[type] =
                -this.parentElement.getBoundingClientRect().height +
                ('top' === type ? page.content_bounds.top : 0) +
                'px'
            }
            page.menu_toggler.timeout = setTimeout(
              page.menu_toggler.hide.bind(this.parentElement.firstElementChild),
              300
            )
          }
        },
        timeout: -1,
      }
      page.modal = {
        info: {
          init: false,
          e: document.createElement('div'),
        },
      }
      e = page.modal.info.e
      document.body.appendChild(e)
      page.modal.info.init = true
      e.id = 'variable_info_display'
      e.className = 'modal fade'
      e.setAttribute('tabindex', '-1')
      e.setAttribute('aria-labelledby', 'variable_info_title')
      e.ariaHidden = 'true'
      e.appendChild(document.createElement('div'))
      e.firstElementChild.className = 'modal-dialog modal-dialog-scrollable'
      e.firstElementChild.appendChild(document.createElement('div'))
      e.firstElementChild.firstElementChild.className = 'modal-content'
      e.firstElementChild.firstElementChild.appendChild((page.modal.info.header = document.createElement('div')))
      e = page.modal.info
      e.header.className = 'modal-header'
      e.header.appendChild(document.createElement('p'))
      e.header.firstElementChild.className = 'h5 modal-title'
      e.header.firstElementChild.id = 'variable_info_title'
      e.header.appendChild(document.createElement('button'))
      e.header.lastElementChild.type = 'button'
      e.header.lastElementChild.className = 'btn-close'
      e.header.lastElementChild.setAttribute('data-bs-dismiss', 'modal')
      e.header.lastElementChild.title = 'close'
      e.header.insertAdjacentElement('afterEnd', (e.body = document.createElement('div')))
      e.body.className = 'modal-body'
      e.body.appendChild((e.title = document.createElement('p')))
      e.title.className = 'h4'
      e.body.appendChild((e.description = document.createElement('p')))

      e.body.appendChild(document.createElement('table'))
      e.body.lastElementChild.className = 'info-feature-table'

      e.body.lastElementChild.appendChild((e.name = document.createElement('tr')))
      e.name.appendChild(document.createElement('td'))
      e.name.firstElementChild.innerText = 'Name'
      e.name.appendChild(document.createElement('td'))

      e.body.lastElementChild.appendChild((e.type = document.createElement('tr')))
      e.type.appendChild(document.createElement('td'))
      e.type.firstElementChild.innerText = 'Type'
      e.type.appendChild(document.createElement('td'))

      e.body.appendChild((e.source = document.createElement('div')))
      e.source.appendChild((e = document.createElement('table')))
      e.className = 'source-table'
      e.appendChild(document.createElement('thead'))
      e.firstElementChild.appendChild(document.createElement('tr'))
      e.firstElementChild.firstElementChild.appendChild(document.createElement('th'))
      e.firstElementChild.firstElementChild.appendChild(document.createElement('th'))
      e.firstElementChild.firstElementChild.firstElementChild.innerText = 'Source'
      e.firstElementChild.firstElementChild.lastElementChild.innerText = 'Accessed'
      e.appendChild(document.createElement('tbody'))

      e = page.modal.info
      e.body.appendChild((e.references = document.createElement('div')))
      e.references.appendChild(document.createElement('p'))
      e.references.firstElementChild.className = 'h3'
      e.references.firstElementChild.innerText = 'References'
      e.references.appendChild((e = document.createElement('ul')))
      e.className = 'reference-list'

      for (i = page.menus.length; i--; ) {
        page.menus[i].state = page.menus[i].getAttribute('state')
        if (page.menus[i].classList.contains('menu-top')) {
          page.top_menu = page.menus[i]
          if (page.menus[i].lastElementChild.tagName === 'BUTTON') {
            page.menus[i].lastElementChild.addEventListener(
              'click',
              page.menu_toggler.toggle.bind(page.menus[i].lastElementChild, 'top')
            )
          }
        } else if (page.menus[i].classList.contains('menu-right')) {
          page.right_menu = page.menus[i]
          if (page.menus[i].lastElementChild.tagName === 'BUTTON') {
            page.menus[i].lastElementChild.addEventListener(
              'click',
              page.menu_toggler.toggle.bind(page.menus[i].lastElementChild, 'right')
            )
          }
        } else if (page.menus[i].classList.contains('menu-bottom')) {
          page.bottom_menu = page.menus[i]
          page.content_bounds.bottom = 40
          if (page.menus[i].lastElementChild.tagName === 'BUTTON') {
            page.menus[i].lastElementChild.addEventListener(
              'click',
              page.menu_toggler.toggle.bind(page.menus[i].lastElementChild, 'bottom')
            )
          }
        } else if (page.menus[i].classList.contains('menu-left')) {
          page.left_menu = page.menus[i]
          if (page.menus[i].lastElementChild.tagName === 'BUTTON') {
            page.menus[i].lastElementChild.addEventListener(
              'click',
              page.menu_toggler.toggle.bind(page.menus[i].lastElementChild, 'left')
            )
          }
        }
      }
      // get options from url
      k = window.location.search.replace('?', '')
      site.url_options = {}
      if (k) {
        e = k.split('&')
        for (i = e.length; i--; ) {
          c = e[i].split('=')
          if (patterns.bool.test(c[1])) c[1] = 'true' === c[1]
          site.url_options[c[0]] = c[1]
          if (patterns.settings.test(c[0])) storage.setItem(c[0].replace(patterns.settings, ''), c[1])
        }
      }

      // check for stored settings
      for (k in site.settings)
        if (Object.hasOwn(site.settings, k)) {
          c = storage.getItem(k)
          if (c) {
            if (patterns.bool.test(c)) {
              c = 'true' === c
            } else if (patterns.number.test(c)) c = parseFloat(c)
            site.settings[k] = c
          }
        }

      // initialize inputs
      if (site.dataviews) {
        for (k in site.dataviews)
          if (Object.hasOwn(site.dataviews, k)) {
            defaults.dataview = k
            break
          }
      } else {
        site.dataviews = {}
        site.dataviews[defaults.dataview] = {dataset: defaults.dataset}
      }
      for (c = document.getElementsByClassName('auto-input'), i = c.length, n = 0; i--; ) {
        e = c[i]
        o = {
          type: e.getAttribute('auto-type'),
          source: void 0,
          value: function () {
            const v = valueOf(this.source)
            return 'undefined' === typeof v ? valueOf(this.default) : v
          },
          default: e.getAttribute('default'),
          options_source: e.getAttribute('auto-options'),
          depends: e.getAttribute('depends'),
          variable: e.getAttribute('variable'),
          dataset: e.getAttribute('dataset') || defaults.dataset,
          view: e.getAttribute('data-view'),
          id: e.id || e.options_source || 'ui' + n++,
          current_index: -1,
          previous: '',
          e: e,
          values: [],
          display: [],
          data: [],
          input: true,
        }
        if (Object.hasOwn(elements, o.type)) {
          p = elements[o.type]
          o.options = o.type === 'select' ? o.e.children : o.e.getElementsByTagName('input')
          o.set = p.setter.bind(o)
          o.get = p.retrieve.bind(o)
          if (p.adder) o.add = p.adder.bind(o)
          o.reset = function () {
            this.set(valueOf(this.default))
          }.bind(o)
          o.listen = p.listener.bind(o)
          _u[o.id] = o
        } else if ('button' === o.type) {
          o.target = o.e.getAttribute('target')
          o.e.addEventListener(
            'click',
            'refresh' === o.target
              ? global_update
              : 'reset_selection' === o.target
              ? global_reset
              : 'reset_storage' === o.target
              ? clear_storage
              : function () {
                  if (Object.hasOwn(_u, this.target)) _u[this.target].reset()
                }.bind(o)
          )
        }
      }

      // initialize variables
      if (site.variables && site.variables.length) {
        for (n = site.variables.length; n--; ) {
          k = site.variables[n].id
          _u[k] = {
            id: k,
            type: 'virtual',
            source: site.variables[n].default,
            previous: void 0,
            default: site.variables[n].default,
            current_index: -1,
            values: [],
            states: site.variables[n].states,
            update: function () {
              this.source = void 0
              for (var p, r, c, i = this.states.length; i--; ) {
                for (c = this.states[i].condition.length, p = true; c--; ) {
                  r = this.states[i].condition[c]
                  if (!check_funs[r.type](valueOf(r.id), valueOf(r.value))) p = false
                }
                if (p) {
                  this.source = this.states[i].value
                  break
                }
              }
              if (!this.source) this.source = this.default
              if (this.source !== this.previous) {
                this.previous = this.source
                request_queue(this.id)
              } else if (Object.hasOwn(_u, this.source)) {
                r = _u[this.source].value()
                if (r !== this.previous) {
                  this.previous = r
                  request_queue(this.id)
                }
              }
            },
            value: function () {
              return valueOf(this.source)
            },
            set: function (v) {
              if (-1 !== this.values.indexOf(v)) {
                this.previous = this.source
                this.source = v
              } else {
                if (Object.hasOwn(_u, this.source) && -1 !== _u[this.source].values.indexOf(v)) {
                  _u[this.source].set(v)
                }
              }
              request_queue(this.id)
            },
          }
          if (_u[k].source) _u[k].values.push(_u[k].source)
          for (p = {}, i = _u[k].states.length; i--; ) {
            _u[k].values.push(_u[k].states[i].value)
            for (ci = _u[k].states[i].condition.length; ci--; ) {
              if (!Object.hasOwn(p, _u[k].states[i].condition[ci].id)) {
                p[_u[k].states[i].condition[ci].id] = {type: 'update', id: k}
              }
            }
          }
          for (k in p) if (Object.hasOwn(p, k)) add_dependency(k, p[k])
        }
      }

      // initialize rules
      if (site.rules && site.rules.length) {
        for (ci = site.rules.length; ci--; ) {
          for (k in site.rules[ci].effects)
            if ('display' === k) {
              site.rules[ci].effects[k] = {e: document.getElementById(site.rules[ci].effects[k])}
              e = site.rules[ci].effects[k].e.getElementsByClassName('auto-input')
              if (e.length) site.rules[ci].effects[k].u = _u[e[0].id]
            }
          for (e = site.rules[ci].condition, n = e.length, i = 0; i < n; i++) {
            if (Object.hasOwn(check_funs, e[i].type)) {
              e[i].check = function () {
                return check_funs[this.type](valueOf(this.id), valueOf(this.value))
              }.bind(e[i])
              if (Object.hasOwn(_u, e[i].id)) {
                add_dependency(e[i].id, {type: 'rule', id: e[i].id, condition: e[i], rule: ci})
                if (!Object.hasOwn(rule_conditions, e[i].id)) rule_conditions[e[i].id] = {}
                rule_conditions[e[i].id][ci] = site.rules[ci]
              }
              if (e[i].check()) {
                for (k in site.rules[ci].effects)
                  if (Object.hasOwn(_u, k)) _u[k].set(valueOf(site.rules[ci].effects[k]))
              } else if (e[i].default) {
                for (k in site.rules[ci].effects) if (Object.hasOwn(_u, k)) _u[k].set(valueOf(e[i].default))
              }
            }
          }
        }
      }

      // fill legends
      for (c = document.getElementsByClassName('legend-scale'), i = c.length; i--; ) {
        k = c[i].parentElement.getAttribute('palette') || site.settings.palette
        if (Object.hasOwn(_u, k)) _u[k].e.addEventListener('change', elements.legend.update.bind(null, c[i]))
        elements.legend.update(c[i])
      }

      window.requestAnimationFrame(trigger_resize)
      window.addEventListener('resize', content_resize)

      if (site && site.data) {
        queue_init()
      } else if (site && site.metadata.datasets) {
        site.data = {}
        if ('string' === typeof site.metadata.datasets) site.metadata.datasets = [site.metadata.datasets]
        for (i = 0, n = site.metadata.datasets.length; i < n; i++) {
          data_loaded[site.metadata.datasets[i]] = false
          load_data(site.metadata.datasets[i], site.metadata.info[site.metadata.datasets[i]].site_file)
        }
      } else {
        throw new Error('No data or metadata information present')
      }
    }

    function content_resize() {
      page.content.style.top =
        (page.top_menu && 'open' === page.top_menu.state
          ? page.top_menu.getBoundingClientRect().height
          : page.content_bounds.top +
            (page.bottom_menu ||
            (page.right_menu && 'open' === page.right_menu.state) ||
            (page.left_menu && 'open' === page.left_menu.state)
              ? 0
              : 40)) + 'px'
      if (page.right_menu) {
        page.content.style.right =
          page.content_bounds.right +
          ('closed' === page.right_menu.state ? 0 : page.right_menu.getBoundingClientRect().width) +
          'px'
      } else if (page.bottom_menu) {
        page.content.style.bottom =
          page.content_bounds.bottom +
          ('closed' === page.bottom_menu.state ? 0 : page.bottom_menu.getBoundingClientRect().height) +
          'px'
      } else if (page.left_menu) {
        page.content.style.left =
          page.content_bounds.left +
          ('closed' === page.left_menu.state ? 0 : page.left_menu.getBoundingClientRect().width) +
          'px'
      }
    }

    function trigger_resize() {
      'undefined' === typeof module && window.dispatchEvent(new Event('resize'))
    }

    function get_options_url() {
      var s = '',
        k,
        v
      for (k in _u)
        if (Object.hasOwn(_u, k) && _u[k].input && !patterns.settings.test(k)) {
          v = _u[k].value()
          if (null !== v && '' !== v && '-1' !== v) s += (s ? '&' : '?') + k + '=' + v
        }
      return window.location.protocol + '//' + window.location.host + window.location.pathname + s
    }

    function init() {
      var k, i, e, c, n, o, cond, v
      defaults.dataset = site.metadata.datasets[0]

      // initialize inputs
      for (k in _u)
        if (Object.hasOwn(_u, k) && Object.hasOwn(elements, _u[k].type)) {
          o = _u[k]
          // resolve options
          if (o.options_source) {
            if (patterns.palette.test(o.options_source)) {
              for (v in palettes) if (Object.hasOwn(palettes, v)) o.add(v, v)
              o.options = o.e.getElementsByTagName(o.type === 'select' ? 'option' : 'input')
              o.reset()
            } else if (patterns.datasets.test(o.options_source)) {
              for (i = site.metadata.datasets.length; i--; ) {
                o.add(i, site.metadata.datasets[i], format_label(site.metadata.datasets[i]))
              }
              o.options = o.e.getElementsByTagName(o.type === 'select' ? 'option' : 'input')
            } else {
              o.option_sets = {}
              v = valueOf(o.dataset) || defaults.dataset
              if (Object.hasOwn(site.metadata.info, v)) {
                if (patterns.ids.test(o.options_source)) {
                  fill_ids_options(o, v, o.option_sets)
                } else if (patterns.variable.test(o.options_source)) {
                  fill_variables_options(o, v, o.option_sets)
                } else if (patterns.levels.test(o.options_source) && Object.hasOwn(variables, o.variable)) {
                  fill_levels_options(o, v, o.variable, o.option_sets)
                }
              }
              if (o.depends) add_dependency(o.depends, {type: 'options', id: o.id})
              if (Object.hasOwn(_u, o.dataset)) add_dependency(o.dataset, {type: 'options', id: o.id})
              if (o.view) add_dependency(o.view, {type: 'options', id: o.id})
            }
          }
          // retrieve option values
          if ('number' === o.type) {
            o.min = o.e.getAttribute('min')
            o.min_ref = parseFloat(o.min)
            o.max = o.e.getAttribute('max')
            o.max_ref = parseFloat(o.max)
            o.ref = isNaN(o.min_ref) || isNaN(o.max_ref)
            o.range = [o.min_ref, o.max_ref]
            o.step = parseFloat(o.e.step) || 1
            o.parsed = {min: undefined, max: undefined}
            o.depends = {}
            o.update = function () {
              const view = _u[this.view],
                variable = valueOf(o.variable || view.y)
              if (!view.time_range) view.time_range = {time: []}
              var d = view.get ? view.get.dataset() : valueOf(this.dataset),
                min = valueOf(this.min) || view.time,
                max = valueOf(this.max) || view.time
              if (patterns.minmax.test(min)) min = _u[this.min][min]
              if (patterns.minmax.test(max)) max = _u[this.max][max]
              this.parsed.min = isNaN(this.min_ref)
                ? 'undefined' === typeof min
                  ? view.time_range.time[0]
                  : 'number' === typeof min
                  ? min
                  : Object.hasOwn(variables, min)
                  ? variables[min].info[d || variables[min].datasets[0]].min
                  : parseFloat(min)
                : this.min_ref
              this.parsed.max = isNaN(this.max_ref)
                ? 'undefined' === typeof max
                  ? view.time_range.time[1]
                  : 'number' === typeof max
                  ? max
                  : Object.hasOwn(variables, max)
                  ? variables[max].info[d || variables[max].datasets[0]].max
                  : parseFloat(max)
                : this.min_ref
              if (this.ref && variable && Object.hasOwn(variables, variable)) {
                this.range[0] =
                  this.e.min =
                  v =
                    isNaN(this.min_ref) ? Math.max(view.time_range.time[0], this.parsed.min) : this.min_ref
                this.range[1] =
                  this.e.max =
                  v =
                    isNaN(this.max_ref) ? Math.min(view.time_range.time[1], this.parsed.max) : this.max_ref
                if (!this.depends[view.y]) {
                  this.depends[view.y] = true
                  add_dependency(view.y, {type: 'update', id: this.id})
                }
                if (this.variable && variable !== this.variable) this.reset()
                if (variables[variable][this.view].summaries[d].filled) this.variable = variable
              } else {
                this.e.min = this.parsed.min
                if (this.parsed.min > this.source || (!this.source && 'min' === this.default)) this.set(this.parsed.min)
                this.e.max = this.parsed.max
                if (this.parsed.max < this.source || (!this.source && 'max' === this.default)) this.set(this.parsed.max)
              }
            }.bind(o)
            if (o.view) add_dependency(o.view, {type: 'update', id: o.id})
            if (o.max && !Object.hasOwn(variables, o.max)) {
              if (Object.hasOwn(_u, o.max)) {
                add_dependency(o.max, {type: 'max', id: o.id})
              } else o.e.max = parseFloat(o.max)
            } else if (o.view) {
              add_dependency(o.view + '_time', {type: 'max', id: o.id})
            }
            if (o.min && !Object.hasOwn(variables, o.min)) {
              if (Object.hasOwn(_u, o.min)) {
                add_dependency(o.min, {type: 'min', id: o.id})
              } else o.e.min = parseFloat(o.min)
            } else if (o.view) {
              add_dependency(o.view + '_time', {type: 'min', id: o.id})
            }
            if (!o.view) o.view = defaults.dataview
            if (o.default) {
              if (!isNaN(parseFloat(o.default))) {
                o.default = parseFloat(o.default)
              } else
                o.reset = function () {
                  if ('max' === this.default) {
                    if (this.range) this.set(valueOf(this.range[1]))
                  } else if ('min' === this.default) {
                    if (this.range) this.set(valueOf(this.range[0]))
                  } else if (Object.hasOwn(_u, this.default)) {
                    this.set(valueOf(this.default))
                  }
                }.bind(o)
            }
            if (o.variable) {
              if (Object.hasOwn(_u, o.variable)) {
                add_dependency(o.variable, {type: 'update', id: o.id})
              } else if (Object.hasOwn(variables, o.variable)) {
                o.e.min = o.min = o.parsed.min = o.range[0] = variables[o.variable].info[defaults.dataset].min
                o.e.max = o.max = o.parsed.max = o.range[1] = variables[o.variable].info[defaults.dataset].max
              }
            }
          } else {
            if (!o.values.length)
              for (i = o.options.length; i--; ) {
                o.values[i] = o.options[i].value
                o.display[i] = format_label(o.options[i].innerText.trim() || o.values[i])
              }
            if ('checkbox' === o.type) {
              o.source = []
              o.current_index = []
              o.default = o.default.split(',')
              if (o.options.length)
                for (i = o.options.length; i--; ) {
                  o.values[i] = o.options[i].value
                }
            } else if (o.values.length && !Object.hasOwn(_u, o.default) && -1 === o.values.indexOf(o.default)) {
              o.default = parseInt(o.default)
              o.default = o.values[o.default] ? o.values[o.default] : ''
            }
          }
          // add listeners
          if ('select' === o.type || 'number' === o.type) {
            o.e.addEventListener('input', o.listen)
            if (
              o.e.parentElement.lastElementChild &&
              o.e.parentElement.lastElementChild.classList.contains('select-reset')
            ) {
              o.e.parentElement.lastElementChild.addEventListener('click', o.reset)
            }
            if (Object.hasOwn(site, o.type) && Object.hasOwn(site[o.type], o.id)) {
              o.filters = site[o.type][o.id]
              o.current_filter = {}
              for (c in o.filters)
                if (Object.hasOwn(o.filters, c) && Object.hasOwn(_u, o.filters[c])) {
                  add_dependency(o.filters[c], {type: 'filter', id: o.id})
                }
              o.filter = function () {
                var k, i, pass, last
                for (k in this.filters)
                  if (Object.hasOwn(this.filters, k)) {
                    this.current_filter[k] = valueOf(this.filters[k])
                  }
                for (i = this.values.length; i--; ) {
                  pass = false
                  if (Object.hasOwn(variables, this.values[i]) && Object.hasOwn(variables[this.values[i]], 'meta')) {
                    for (k in this.current_filter)
                      if (Object.hasOwn(variables[this.values[i]].meta, k)) {
                        pass = variables[this.values[i]].meta[k] === this.current_filter[k]
                        if (!pass) break
                      }
                  }
                  if (pass) last = this.values[i]
                  this.options[i].classList[pass ? 'remove' : 'add']('hidden')
                }
                this.current_index = this.values.indexOf(this.value())
                if (
                  last &&
                  (-1 === this.current_index || this.options[this.current_index].classList.contains('hidden'))
                ) {
                  this.set(last)
                }
              }.bind(o)
            }
          } else if ('switch' === o.type) {
            if ('boolean' !== typeof o.default) o.default = o.e.checked
            o.e.addEventListener('change', o.listen)
          } else {
            for (i = o.options.length; i--; ) o.options[i].addEventListener('click', o.listen)
          }
          // initialize settings inputs
          if (patterns.settings.test(o.id)) {
            o.setting = o.id.replace(patterns.settings, '')
            if (!o.default && Object.hasOwn(site.settings, o.setting)) o.default = site.settings[o.setting]
            add_dependency(o.id, {type: 'setting', id: o.id})
          }
          v = site.url_options[o.id] || storage.getItem(o.id.replace(patterns.settings, ''))
          if (v) {
            if (patterns.bool.test(v)) v = 'true' === v
            o.set(v)
          } else o.reset()
        }
      // initialize dataviews
      for (k in site.dataviews)
        if (Object.hasOwn(site.dataviews, k)) {
          _u[k] = e = site.dataviews[k]
          if (!Object.hasOwn(e, 'time')) e.time = meta.time_variable
          e.id = k
          e.value = function () {
            if (this.get) {
              return (
                '' +
                this.get.dataset() +
                this.get.ids() +
                this.get.features() +
                this.get.variables() +
                site.settings.summary_selection
              )
            }
          }.bind(e)
          if (e.palette && 'string' === typeof e.palette && Object.hasOwn(_u, e.palette)) {
            add_dependency(e.palette, {type: 'dataview', id: k})
          }
          if (e.dataset && 'string' === typeof e.dataset && Object.hasOwn(_u, e.dataset)) {
            add_dependency(e.dataset, {type: 'dataview', id: k})
          }
          if (e.ids && 'string' === typeof e.ids && Object.hasOwn(_u, e.ids)) {
            add_dependency(e.ids, {type: 'dataview', id: k})
          }
          e.time_range = {variable: '', index: [], time: [], filtered: []}
          add_dependency(k, {type: 'time_range', id: k})
          if (Object.hasOwn(_u, e.x)) {
            add_dependency(e.x, {type: 'time_range', id: k})
          }
          if (Object.hasOwn(_u, e.y)) {
            add_dependency(e.y, {type: 'time_range', id: k})
          }
          for (cond in e.features)
            if (Object.hasOwn(e.features, cond)) {
              if ('string' === typeof e.features[cond] && Object.hasOwn(_u, e.features[cond])) {
                add_dependency(e.features[cond], {type: 'dataview', id: k})
              }
            }
          if (e.variables)
            for (i = e.variables.length; i--; ) {
              if (Object.hasOwn(e.variables[i], 'variable')) {
                if (Object.hasOwn(_u, e.variables[i].variable)) {
                  add_dependency(e.variables[i].variable, {type: 'dataview', id: k})
                }
              } else e.variables.splice(i, 1)
              if (Object.hasOwn(e.variables[i], 'type')) {
                if (Object.hasOwn(_u, e.variables[i].type)) {
                  add_dependency(e.variables[i].type, {type: 'dataview', id: k})
                }
              } else e.variables[i].type = '='
              if (Object.hasOwn(e.variables[i], 'value')) {
                if (Object.hasOwn(_u, e.variables[i].value)) {
                  add_dependency(e.variables[i].value, {type: 'dataview', id: k})
                }
              } else e.variables[i].value = 0
            }
          compile_dataview(e)
          conditionals.dataview(e)
        }
      // initialize outputs
      for (c = document.getElementsByClassName('auto-output'), i = c.length, n = 0; i--; ) {
        e = c[i]
        n = meta.time_n
        o = {
          type: e.getAttribute('auto-type'),
          view: e.getAttribute('data-view'),
          id: e.id || 'out' + n++,
          e: e,
        }
        _u[o.id] = o
        if (o.view) {
          if (!Object.hasOwn(_c, o.view)) _c[o.view] = []
          if (!Object.hasOwn(_c, o.view + '_filter')) _c[o.view + '_filter'] = []
        }
        if (Object.hasOwn(elements, o.type) && Object.hasOwn(elements[o.type], 'init')) {
          elements[o.type].init(o)
        }
      }
    }

    function valueOf(v) {
      v = 'string' === typeof v && Object.hasOwn(_u, v) ? _u[v] : v
      if (v && v.value) {
        v = valueOf(v.value())
      }
      return v
    }

    function add_layer_listeners(feature, layer) {
      layer.on({
        mouseover: elements.map.mouseover.bind(this),
        mouseout: elements.map.mouseout.bind(this),
        click: elements.map.click.bind(this),
      })
    }

    function retrieve_layer(u, source) {
      if (Object.hasOwn(site.maps._raw, source.url)) {
        process_layer(source, u)
      } else {
        var f = new window.XMLHttpRequest()
        f.onreadystatechange = function (u) {
          if (4 === f.readyState && 200 === f.status) {
            site.maps._raw[source.url] = f.responseText
            process_layer(this, u)
          }
        }.bind(source, u)
        f.open('GET', source.url, true)
        f.send()
      }
    }

    function process_layer(source, u) {
      const bgc = site.settings.theme_dark ? '#666' : '#000'
      var k, l, p, f, id
      site.maps[u.id]._layers[source.name] = L.geoJSON(JSON.parse(site.maps._raw[source.url]), {
        onEachFeature: add_layer_listeners.bind(u),
      })
      for (k in site.maps[u.id]._layers[source.name]._layers)
        if (Object.hasOwn(site.maps[u.id]._layers[source.name]._layers, k)) {
          l = site.maps[u.id]._layers[source.name]._layers[k]
          l.source = source
          p = l.feature.properties
          id = p[source.id_property]
          if (!Object.hasOwn(entities, id) && patterns.leading_zeros.test(id))
            id = p[source.id_property] = id.replace(patterns.leading_zeros, '')
          if (Object.hasOwn(entities, id)) {
            if (!Object.hasOwn(entities[id], 'layer')) entities[id].layer = {}
            entities[id].layer[u.id] = l
            if (site.settings.background_shapes && u.displaying && u.options.background_shapes === entities[id].group) {
              u.vstate = ''
              l.options.interactive = false
              l.addTo(u.displaying)
              l.bringToBack()
              l.setStyle({
                fillOpacity: 0,
                color: bgc,
                weight: 1,
              })
            }
          } else {
            entities[id] = {layer: {}, features: {id: id}}
            entities[id].layer[u.id] = l
          }
          for (f in p)
            if (Object.hasOwn(p, f) && !Object.hasOwn(entities[id].features, f)) {
              if (
                'name' === f.toLowerCase() &&
                (!Object.hasOwn(entities[id].features, 'name') ||
                  entities[id].features.id === entities[id].features.name)
              ) {
                entities[id].features[f.toLowerCase()] = p[f]
                entitiesByName[p[f]] = entities[id]
              } else {
                entities[id].features[f] = p[f]
              }
            }
        } else {
          throw new Error('retrieve_layer failed: ' + f.responseText)
        }
      conditionals.map_shapes(u)
      conditionals.map_colors(u, void 0, true)
      if (site.maps._waiting && site.maps._waiting[source.name]) {
        for (var i = site.maps._waiting[source.name].length; i--; )
          if (u.id !== site.maps._waiting[source.name][i]) {
            request_queue(site.maps._waiting[source.name][i])
            if (Object.hasOwn(_u, site.maps._waiting[source.name][i]) && _u[site.maps._waiting[source.name][i]].color) {
              conditionals.map_colors(_u[site.maps._waiting[source.name][i]], void 0, true)
            }
          }
      }
    }

    function quantile(p, n, o, x) {
      var a = p * (n - 1),
        ap = a % 1,
        bp = 1 - ap,
        b = o + Math.ceil(a)
      a = o + Math.floor(a)
      return x[a][1] * ap + x[b][1] * bp
    }

    function init_summaries(view) {
      view = view || defaults.dataview
      var m, v, d, y, l
      for (v in variables)
        if (Object.hasOwn(variables, v)) {
          if (!Object.hasOwn(variables[v], view)) variables[v][view] = {order: {}, summaries: {}}
          m = variables[v][view]
          for (d in variables[v].info) {
            if (Object.hasOwn(variables[v].info, d)) {
              m.order[d] = []
              if ('string' === variables[v].info[d].type) {
                m.table = {}
                for (l in variables[v].levels_ids)
                  if (Object.hasOwn(variables[v].levels_ids, l)) {
                    m.table[l] = []
                    for (y = meta.time_n; y--; ) m.table[l].push(0)
                  }
                m.summaries[d] = {
                  filled: false,
                  time_range: [0, 0],
                  missing: [],
                  n: [],
                  mode: [],
                  level_ids: variables[v].levels_ids,
                  levels: variables[v].levels,
                }
                for (y = meta.time_n; y--; ) {
                  m.order[d].push([])
                  m.order[d].push([])
                  m.summaries[d].missing.push(0)
                  m.summaries[d].n.push(0)
                  m.summaries[d].mode.push('')
                }
              } else {
                m.summaries[d] = {
                  filled: false,
                  time_range: [0, 0],
                  missing: [],
                  n: [],
                  sum: [],
                  max: [],
                  q3: [],
                  mean: [],
                  norm_median: [],
                  median: [],
                  q1: [],
                  min: [],
                }
                for (y = meta.time_n; y--; ) {
                  m.order[d].push([])
                  m.order[d].push([])
                  m.summaries[d].missing.push(0)
                  m.summaries[d].n.push(0)
                  m.summaries[d].sum.push(0)
                  m.summaries[d].max.push(-Infinity)
                  m.summaries[d].q3.push(0)
                  m.summaries[d].mean.push(0)
                  m.summaries[d].norm_median.push(0)
                  m.summaries[d].median.push(0)
                  m.summaries[d].q1.push(0)
                  m.summaries[d].min.push(Infinity)
                }
              }
            }
          }
        }
    }

    function calculate_summary(measure, view, full) {
      if (!Object.hasOwn(variables[measure], view))
        variables[measure][view] = JSON.parse(JSON.stringify(variables[measure][defaults.dataview]))
      const v = site.dataviews[view],
        s = v.selection[site.settings.summary_selection],
        dataset = v.get.dataset(),
        m = variables[measure][view],
        mo = m.order[dataset],
        ms = m.summaries[dataset],
        ny = meta.time_n,
        levels = variables[measure].levels_ids
      for (var k, id, dim, en, l, y = meta.time_n; y--; ) {
        mo[y] = []
        ms.missing[y] = 0
        ms.n[y] = 0
        if (levels) {
          ms.mode[y] = ''
          for (k in levels) if (Object.hasOwn(levels, k)) m.table[k][y] = 0
        } else {
          ms.sum[y] = 0
          ms.mean[y] = 0
          ms.max[y] = -Infinity
          ms.min[y] = Infinity
        }
      }
      for (k in s)
        if (Object.hasOwn(s, k)) {
          en = s[k]
          if (!Object.hasOwn(en.summary, measure))
            en.summary[measure] = {n: 0, time_range: [Infinity, -Infinity], overall: ms, order: mo}
          en.summary[measure].n = 0
          en.summary[measure].time_range[0] = Infinity
          en.summary[measure].time_range[1] = -Infinity
          id = en.features.id
          for (y = 0; y < ny; y++) {
            dim = en.data[measure][y]
            if (full) {
              mo[y].push([id, dim])
            }
            if (levels ? Object.hasOwn(levels, dim) : 'number' === typeof dim) {
              en.summary[measure].n++
              if (y < en.summary[measure].time_range[0]) en.summary[measure].time_range[0] = y
              if (y > en.summary[measure].time_range[1]) en.summary[measure].time_range[1] = y
              ms.n[y]++
              if (levels) {
                m.table[dim][y]++
              } else {
                ms.sum[y] += dim
                if (dim > ms.max[y]) ms.max[y] = dim
                if (dim < ms.min[y]) ms.min[y] = dim
              }
            } else ms.missing[y]++
          }
        }
      ms.time_range[0] = Infinity
      ms.time_range[1] = -Infinity
      if (full) {
        for (y = 0; y < ny; y++) {
          if (levels) {
            if (ms.n[y]) {
              mo[y].sort(check_funs.sort_a1)
              if (y < ms.time_range[0]) ms.time_range[0] = y
              if (y > ms.time_range[1]) ms.time_range[1] = y
              l = 0
              for (k in m.table)
                if (Object.hasOwn(m.table, k)) {
                  if (m.table[k][y] > m.table[variables[measure].levels[l]][y]) l = levels[k]
                }
              ms.mode[y] = variables[measure].levels[l]
            } else ms.mode[y] = NaN
          } else {
            if (ms.n[y]) {
              mo[y].sort(check_funs.sort_a1)
              if (y < ms.time_range[0]) ms.time_range[0] = y
              if (y > ms.time_range[1]) ms.time_range[1] = y
              ms.mean[y] = ms.sum[y] / ms.n[y]
              if (!isFinite(ms.min[y])) ms.min[y] = ms.mean[y]
              if (!isFinite(ms.max[y])) ms.max[y] = ms.mean[y]
              if (1 === ms.n[y]) {
                ms.q3[y] = ms.median[y] = ms.q1[y] = null == mo[y][0][1] ? ms.mean[y] : mo[y][0][1]
              } else {
                ms.median[y] =
                  1 === ms.n[y] % 2
                    ? mo[y][ms.missing[y] + (ms.n[y] + 1) / 2][1]
                    : quantile(0.5, ms.n[y], ms.missing[y], mo[y])
                ms.q3[y] = quantile(0.75, ms.n[y], ms.missing[y], mo[y])
                ms.q1[y] = quantile(0.25, ms.n[y], ms.missing[y], mo[y])
              }
            } else {
              ms.max[y] = 0
              ms.q3[y] = 0
              ms.median[y] = 0
              ms.q1[y] = 0
              ms.min[y] = 0
            }
            ms.norm_median[y] =
              'number' === typeof ms.max[y] && ms.max[y] - ms.min[y]
                ? (ms.median[y] - ms.min[y]) / (ms.max[y] - ms.min[y])
                : ms.median[y]
          }
        }
      } else {
        for (y = 0; y < ny; y++) {
          if (ms.n[y]) {
            if (y < ms.time_range[0]) ms.time_range[0] = y
            if (y > ms.time_range[1]) ms.time_range[1] = y
            if (levels) {
              q1 = 0
              for (k in m.table)
                if (Object.hasOwn(m.table, k)) {
                  if (m.table[k][y] > m.table[variables[measure].levels[q1]][y]) q1 = levels[k]
                }
              ms.mode[y] = variables[measure].levels[q1]
            } else ms.mean[y] = ms.sum[y] / ms.n[y]
          } else {
            ms[levels ? 'mode' : 'mean'][y] = NaN
          }
        }
      }
      ms.filled = true
    }

    function load_id_maps() {
      var ids, i, f, k, u, has_map
      for (k in site.metadata.info)
        if (Object.hasOwn(site.data, k)) {
          for (ids = site.metadata.info[k].ids, i = ids.length, has_map = false; i--; )
            if (Object.hasOwn(ids[i], 'map')) {
              has_map = true
              if (Object.hasOwn(data_maps, ids[i].map)) {
                if (data_maps[ids[i].map].retrieved) {
                  site.metadata.info[k].schema.fields[i].ids = data_maps[k] = Object.hasOwn(
                    data_maps[ids[i].map].resource,
                    k
                  )
                    ? data_maps[ids[i].map].resource[k]
                    : data_maps[ids[i].map].resource
                  map_entities(k)
                } else {
                  if (-1 === data_maps[ids[i].map].queue.indexOf(k)) data_maps[ids[i].map].queue.push(k)
                }
              } else if ('string' !== typeof ids[i].map || ids[i].map_content) {
                if (ids[i].map_content) {
                  data_maps[ids[i].map] = {queue: [], resource: JSON.parse(ids[i].map_content), retrieved: true}
                  site.metadata.info[k].schema.fields[i].ids = data_maps[k] = Object.hasOwn(
                    data_maps[ids[i].map].resource,
                    k
                  )
                    ? data_maps[ids[i].map].resource[k]
                    : data_maps[ids[i].map].resource
                } else {
                  data_maps[k] = ids[i].map
                }
                map_entities(k)
                for (u in data_queue[k])
                  if (Object.hasOwn(data_queue[k], u)) {
                    _u[u].state = false
                    data_queue[k][u]()
                    delete data_queue[k][u]
                  }
              } else {
                data_maps[ids[i].map] = {queue: [k], resource: {}, retrieved: false}
                f = new window.XMLHttpRequest()
                f.onreadystatechange = function (url, fi) {
                  if (4 === f.readyState) {
                    if (200 === f.status) {
                      data_maps[url].resource = JSON.parse(f.responseText)
                      data_maps[url].retrieved = true
                      for (var k, i = data_maps[url].queue.length, u; i--; ) {
                        k = data_maps[url].queue[i]
                        site.metadata.info[k].schema.fields[fi].ids = data_maps[k] = Object.hasOwn(
                          data_maps[url].resource,
                          k
                        )
                          ? data_maps[url].resource[k]
                          : data_maps[url].resource
                        map_entities(k)
                        for (u in data_queue[k])
                          if (Object.hasOwn(data_queue[k], u)) {
                            _u[u].state = false
                            data_queue[k][u]()
                            delete data_queue[k][u]
                          }
                      }
                      for (k in _c)
                        if (Object.hasOwn(_c, k)) {
                          request_queue(k)
                        }
                    } else {
                      throw new Error('load_id_maps failed: ' + f.responseText)
                    }
                  }
                }.bind(null, ids[i].map, i)
                f.open('GET', ids[i].map, true)
                f.send()
              }
            }
          if (!has_map) {
            data_maps[k] = {}
            map_entities(k)
            for (u in data_queue[k])
              if (Object.hasOwn(data_queue[k], u)) {
                _u[u].state = false
                data_queue[k][u]()
                delete data_queue[k][u]
              }
          }
        }
    }

    function map_variables() {
      var k, v, i, t, ti, m, l
      for (k in site.metadata.info)
        if (Object.hasOwn(site.metadata.info, k)) {
          data_queue[k] = {}
          m = site.metadata.info[k]
          m.id_vars = []
          for (t = m.time, v = m.schema.fields, i = m.ids.length; i--; ) m.id_vars.push(m.ids[i].variable)
          for (i = v.length; i--; ) {
            if (Object.hasOwn(variables, v[i].name)) {
              variables[v[i].name].datasets.push(k)
              variables[v[i].name].components[k] = []
              variables[v[i].name].info[k] = v[i]
              if ('string' === v[i].type) {
                for (l in v[i].table)
                  if (Object.hasOwn(v[i].table, l) && !Object.hasOwn(variables[v[i].name].levels_ids, l)) {
                    variables[v[i].name].levels_ids[l] = variables[v[i].name].levels.length
                    variables[v[i].name].levels.push(l)
                  }
              }
            } else {
              variables[v[i].name] = {datasets: [k], info: {}, components: {}}
              variables[v[i].name].components[k] = []
              variables[v[i].name].info[k] = v[i]
              variables[v[i].name].type = v[i].type
              if ('string' === v[i].type) {
                variables[v[i].name].levels = []
                variables[v[i].name].levels_ids = {}
                for (l in v[i].table)
                  if (Object.hasOwn(v[i].table, l)) {
                    variables[v[i].name].levels_ids[l] = variables[v[i].name].levels.length
                    variables[v[i].name].levels.push(l)
                  }
              }
              variables[v[i].name].meta = variables[v[i].name].info[k].info
              if (!variables[v[i].name].meta)
                variables[v[i].name].meta = {
                  full_name: v[i].name,
                  measure: v[i].name.split(':')[1],
                  short_name: format_label(v[i].name),
                }
              variables[v[i].name].meta.full_name = v[i].name
              if (!Object.hasOwn(variables[v[i].name].meta, 'measure'))
                variables[v[i].name].meta.measure = v[i].name.split(':')[1] || v[i].name
              if (!Object.hasOwn(variables[v[i].name].meta, 'short_name'))
                variables[v[i].name].meta.short_name = format_label(v[i].name)
              if (!Object.hasOwn(variables[v[i].name].meta, 'long_name'))
                variables[v[i].name].meta.long_name = variables[v[i].name].meta.short_name
              if (!Object.hasOwn(variable_info, v[i].name)) variable_info[v[i].name] = variables[v[i].name].meta
              if (!meta.time.length && v[i].name === t) {
                meta.time_range[0] = v[i].min
                meta.time_range[1] = v[i].max
                meta.time_variable = t
                for (ti = v[i].max - v[i].min + 1; ti--; ) meta.time[ti] = v[i].min + ti
                meta.time_n = meta.time.length
              }
            }
          }
          if (!meta.time_variable) {
            meta.time_range[0] = 0
            meta.time_range[1] = 0
            meta.time[0] = 0
            meta.time_n = 1
          }
          if (Object.hasOwn(m, '_references')) {
            if (!Object.hasOwn(variable_info, '_references')) variable_info._references = {}
            for (t in m._references)
              if (Object.hasOwn(m._references, t))
                variable_info._references[t] = {
                  reference: m._references[t],
                  element: make_variable_reference(m._references[t]),
                }
          }
        }
    }

    function map_entities(g) {
      var id,
        f,
        k,
        overwrite = false
      if (Object.hasOwn(site.data, g) && !init_log[g]) {
        for (id in site.data[g]) {
          if (Object.hasOwn(site.data[g], id)) {
            overwrite = data_maps[g][id]
            f = overwrite || {id: id, name: id}
            f.id = id
            if (Object.hasOwn(entities, id)) {
              entities[id].group = g
              entities[id].data = site.data[g][id]
              entities[id].variables = variable_info
              if (!Object.hasOwn(entities[id], 'features')) entities[id].features = {}
              for (k in f)
                if ('id' === k || (Object.hasOwn(f, k) && (overwrite || !Object.hasOwn(entities[id].features, k))))
                  entities[id].features[k] = f[k]
              entities[id].summary = {}
            } else {
              entities[id] = {group: g, data: site.data[g][id], variables: variable_info, features: f, summary: {}}
            }
            if (f) {
              entitiesByName[f.name] = entities[id]
              if (Object.hasOwn(f, 'district') && id.length > 4) {
                f.county = id.substring(0, 5)
              }
            }
          }
        }
        init_log[g] = true
        if (!init_log.first) {
          init_summaries()
          init()
          init_log.first = true
        }
      }
    }

    function compile_dataview(v) {
      var i
      v.times = []
      if (v.time_filters) {
        for (i = v.time_filters.length; i--; )
          if (Object.hasOwn(_u, v.time_filters[i].value)) {
            add_dependency(v.time_filters[i].value, {type: 'time_filters', id: v.id})
          }
      }
      v.selection = {ids: {}, features: {}, variables: [], dataset: {}, filtered: {}, all: {}}
      v.n_selected = {ids: 0, features: 0, variables: 0, dataset: 0, filtered: 0, all: 0}
      v.get = {
        dataset: function () {
          return (
            valueOf(
              'string' === typeof v.dataset && Object.hasOwn(_u, v.dataset) ? _u[v.dataset].value() : v.dataset
            ) || defaults.dataset
          )
        },
        ids: function () {
          return valueOf('string' === typeof v.ids && Object.hasOwn(_u, v.ids) ? _u[v.ids].value() : v.ids)
        },
        features: function () {
          var s = '',
            k
          if (v.features)
            for (k in v.features)
              if (Object.hasOwn(v.features, k)) {
                s += k + valueOf(v.features[k])
              }
          return s
        },
        variables: function () {
          if (v.variables) {
            for (var s = '', i = v.variables.length; i--; )
              s += valueOf(v.variables[i].variable) + valueOf(v.variables[i].type) + valueOf(v.variables[i].value)
            return s
          } else return ''
        },
      }
      v.ids_check =
        'string' === typeof v.get.ids()
          ? function (a, b) {
              return !a || -1 == a || a === b || (b && a.length > 2 && a === b.substring(0, a.length))
            }
          : check_funs.includes
      v.k = ''
      v.checks = {
        dataset: function (e) {
          return this.get.dataset() === e.group
        }.bind(v),
        ids: ('string' === typeof v.ids &&
        Object.hasOwn(_u, v.ids) &&
        (('virtual' === _u[v.ids].type && Object.hasOwn(_u, _u[v.ids].source)) ||
          (Object.hasOwn(_u[v.ids], 'depends') && Object.hasOwn(_u, _u[v.ids].depends)))
          ? 'virtual' === _u[v.ids].type
            ? function (e) {
                const c = _u[_u[this.ids].source],
                  d = valueOf(c.dataset)
                return (
                  e.features &&
                  this.ids_check(
                    this.get.ids(),
                    e.features[!c || e.group === d || !Object.hasOwn(e.features, d) ? 'id' : d]
                  )
                )
              }
            : function (e) {
                const f = _u[_u[this.ids].depends].value()
                return (
                  e.features &&
                  this.ids_check(this.get.ids(), Object.hasOwn(e.features, f) ? valueOf(e.features[f]) : e.features.id)
                )
              }
          : function (e) {
              return e.features && this.ids_check(this.get.ids(), e.features.id)
            }
        ).bind(v),
        features: function (e) {
          if (e.features) {
            var v,
              pass = true
            for (this.k in this.features) {
              if (Object.hasOwn(this.features, this.k)) {
                v = valueOf(this.features[this.k])
                pass = check_funs['string' === typeof v ? 'equals' : 'includes'](v, valueOf(e.features[this.k]))
                if (!pass) break
              }
            }
            return pass
          } else return true
        }.bind(v),
        variables: function (e) {
          if (e.data) {
            const t = valueOf(this.time_agg) - meta.time_range[0]
            var i,
              n,
              v,
              pass = true
            for (i = this.variables.length; i--; ) {
              n = valueOf(this.variables[i].variable)
              v = valueOf(this.variables[i].value)
              pass =
                !Object.hasOwn(e.data, n) ||
                typeof v !== typeof e.data[n][t] ||
                check_funs[valueOf(this.variables[i].type)](v, e.data[n][t])
              if (!pass) break
            }
            return pass
          } else return true
        }.bind(v),
      }
      v.check = function (e) {
        return {
          ids: !this.ids || this.checks.ids(e),
          features: !this.features || this.checks.features(e),
          variables: !this.variables || this.checks.variables(e),
          dataset: !this.dataset || this.checks.dataset(e),
        }
      }.bind(v)
    }

    function clear_storage() {
      if (window.localStorage) window.localStorage.clear()
      window.location.reload()
    }

    function global_update() {
      for (var k in _u) if (Object.hasOwn(_u, k)) request_queue(k, true)
    }

    function global_reset() {
      for (var k in _u)
        if (Object.hasOwn(_u, k) && !_u[k].setting && _u[k].reset) {
          _u[k].reset()
          request_queue(k, true)
        }
    }

    function request_queue(id, force) {
      if (_u[id] && _u[id].setting) {
        site[_u[id].setting] = _u[id].value()
      }
      queue[id] = true
      window.cancelAnimationFrame(queue._timeout)
      queue._timeout = window.requestAnimationFrame(run_queue.bind(null, force))
    }

    function run_queue(force) {
      for (var k in queue)
        if ('_timeout' !== k && Object.hasOwn(queue, k) && queue[k]) {
          queue[k] = false
          refresh_conditions(k, force)
        }
      k = get_options_url()
      if (init_log.first && k !== site.state) {
        site.state = k
        if (!site.settings.hide_url_parameters) window.history.replaceState(Date.now(), '', k)
        window.requestAnimationFrame(content_resize)
      }
    }

    function refresh_conditions(id, force) {
      if (Object.hasOwn(_c, id)) {
        var c = _u[id],
          d = _c[id],
          i,
          ci,
          n,
          r = [],
          pass,
          k,
          ch,
          v = c && c.value() + ''
        if (c && (force || c.state !== v)) {
          c.state = v
          for (i = d.length; i--; ) {
            if ('rule' === d[i].type) {
              if (-1 === r.indexOf(d[i].rule)) {
                r.push(site.rules[d[i].rule])
              }
            } else {
              if ('function' === typeof _u[d[i].id][d[i].type]) {
                _u[d[i].id][d[i].type]()
              } else {
                conditionals[d[i].type](_u[d[i].id], c)
              }
            }
          }
          for (i = r.length; i--; ) {
            for (n = r[i].condition.length, ci = 0; ci < n; ci++) {
              pass = r[i].condition[ci].check()
              if (!pass) break
            }
            for (k in r[i].effects)
              if (pass) {
                if (k === 'display') {
                  r[i].effects[k].e.classList.remove('hidden')
                } else if (Object.hasOwn(_u, k)) {
                  _u[k].set(valueOf(r[i].effects[k]))
                }
              } else if (k === 'display') {
                r[i].effects[k].e.classList.add('hidden')
                if (r[i].effects[k].u) r[i].effects[k].u.reset()
                for (ch = r[i].effects[k].e.getElementsByClassName('auto-input'), ci = ch.length; ci--; ) {
                  if (Object.hasOwn(_u, ch[ci].id)) _u[ch[ci].id].reset()
                }
              } else if (Object.hasOwn(r[i], 'default')) {
                if (Object.hasOwn(_u, k)) {
                  _u[k].set(valueOf(r[i].default))
                }
              }
          }
        }
      }
    }

    function queue_init_plot() {
      if (window.Plotly) {
        Plotly.newPlot(this.e, this.config)
        this.e
          .on('plotly_hover', elements.plot.mouseover.bind(this))
          .on('plotly_unhover', elements.plot.mouseout.bind(this))
          .on('plotly_click', elements.plot.click.bind(this))
        update_plot_theme(this)
        this.update()
        window.requestAnimationFrame(trigger_resize)
      } else {
        setTimeout(queue_init_plot.bind(this), 20)
      }
    }

    function queue_init_map() {
      if (window.L) {
        this.map = L.map(this.e, this.options)
        this.displaying = L.featureGroup().addTo(this.map)
        this.tiles = {}
        const theme = site.settings.theme_dark ? 'dark' : 'light'
        var k, i
        if (Object.hasOwn(site.maps, this.id)) {
          site.maps[this.id].u = this
          if (site.maps[this.id].tiles) {
            if (site.maps[this.id].tiles.url) {
              this.tiles[theme] = L.tileLayer(site.maps[this.id].tiles.url, site.maps[this.id].tiles.options)
              this.tiles[theme].addTo(this.map)
            } else {
              for (k in site.maps[this.id].tiles)
                if (Object.hasOwn(site.maps[this.id].tiles, k)) {
                  this.tiles[k] = L.tileLayer(site.maps[this.id].tiles[k].url, site.maps[this.id].tiles[k].options)
                  if (theme === k) this.tiles[k].addTo(this.map)
                }
            }
          }
          if (!Object.hasOwn(site.maps, '_raw')) site.maps._raw = {}
          if (!Object.hasOwn(site.maps[this.id], '_layers')) site.maps[this.id]._layers = {}
          for (i = site.maps[this.id].shapes.length; i--; ) {
            if (!site.maps[this.id].shapes[i].name)
              site.maps[this.id].shapes[i].name = site.metadata.datasets[i < site.metadata.datasets.length ? i : 0]
            retrieve_layer(this, site.maps[this.id].shapes[i])
          }
        }
      } else {
        setTimeout(queue_init_map.bind(this), 20)
      }
    }

    function queue_init_table() {
      if (window.jQuery && window.DataTable && Object.hasOwn(site.dataviews[this.view], 'get')) {
        this.options.columns = this.header
        this.table = $(this.e).DataTable(this.options)
        this.update()
      } else {
        setTimeout(queue_init_table.bind(this), 20)
      }
    }

    function queue_init() {
      if ('loading' !== document.readyState) {
        load_id_maps()
      } else {
        setTimeout(queue_init, 5)
      }
    }

    function load_data(name, url) {
      var f = new window.XMLHttpRequest()
      f.onreadystatechange = function () {
        if (4 === f.readyState) {
          if (200 === f.status) {
            site.data[name] = JSON.parse(f.responseText)
            data_loaded[name] = true
            if (site.settings.partial_init) {
              queue_init()
            } else {
              for (var k in data_loaded) if (Object.hasOwn(data_loaded, k) && !data_loaded[k]) return void 0
              queue_init()
            }
          } else {
            throw new Error('load_data failed: ' + f.responseText)
          }
        }
      }
      f.open('GET', url, true)
      f.send()
    }
  }

  if ('undefined' === typeof module) {
    community(window, document, site)
  } else module.exports = community
})()
