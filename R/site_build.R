#' Render a Website
#'
#' Write HTML output from the \code{site.R} file in a site project.
#'
#' @param dir Path to the site project directory.
#' @param file Name of the R file to build the site from.
#' @param name Name of the HTML file to be created.
#' @param variables A character vector of variable names to include from the data. If no specified,
#' all variables are included.
#' @param options A list with options to be passed to the site. These will be written to \code{docs/settings.json},
#' which can be edited by hand.
#' @param bundle_data Logical; if \code{TRUE}, will write the data to the site file; useful when
#' running the site locally without a server (viewing the file directly in a browser).
#' Otherwise, the data will be loaded separately through an http request.
#' @param bundle_libs Logical; if \code{TRUE}, will download dependencies to the \code{docs/lib} directory.
#' This can allow you to run the site offline for all but Leaflet tiles and any remote resources specified in
#' \code{file} (such as map shapes) or metadata (such as map overlays).
#' @param libs_overwrite Logical; if \code{TRUE}, will re-download existing dependencies.
#' @param libs_base_only Logical; if \code{TRUE}, will only download the base community dependencies to be served locally.
#' @param open_after Logical; if \code{TRUE}, will open the site in a browser after it is built.
#' @param aggregate Logical; if \code{TRUE}, and there is a larger datasets with IDs that partially match
#' IDs in a smaller dataset or that has a map to those IDs, and there are NAs in the smaller dataset, will
#' attempt to fill NAs with averages from the larger dataset.
#' @param sparse_time Logical; if \code{FALSE}, will not trim times from a variable that are all missing.
#' @param force Logical; if \code{TRUE}, will reprocess data even if the source data is older than the existing
#' processed version.
#' @param version Version of the base script and stylesheet: \code{"v1"} (default) for the version 1 stable release,
#' \code{"dev"} for the current unstable release, or \code{"local"} for a copy of the development files
#' (\code{community.js} and \code{community.css}) served from a local \code{dist} directory. Can also
#' be a URL (starting with \code{http}) where files can be found (\code{{version}/community.js} and
#' \code{{version}/community.css}).
#' @param parent Directory path or repository URL of a data site from which to use data, rather than using local data.
#' @param include_api Logical; if \code{TRUE}, will write the \code{docs/functions/api.js} file.
#' @param endpoint URL of the served API.
#' @param tag_id Google tag ID (in the form of \code{GTM-XXXXXX}, were \code{GTM-} might be different depending on the
#' tag type (such as \code{G-} or \code{GT-}); see \href{tagmanager.google.com}{https://tagmanager.google.com}),
#' which will enables tracking, conditional on the \code{settings.tracking} setting.
#' @param serve Logical; if \code{TRUE}, starts a local server from the site's \code{docs} directory.
#' Once a server is running, you can use \code{\link[httpuv]{stopAllServers}} to stop it.
#' @param host The IPv4 address to listen to if \code{serve} is \code{TRUE}; defaults to \code{"127.0.0.1"}.
#' @param port The port to listen on if \code{serve} is \code{TRUE}; defaults to 3000.
#' @examples
#' \dontrun{
#' # run from within a site project directory, initialized with `init_site()`
#' site_build(".")
#'
#' # serve locally and view the site
#' site_build(".", serve = TRUE, open_after = TRUE)
#' }
#' @return Invisible path to the written file.
#' @seealso To initialize a site project, use \code{\link{init_site}}.
#' @export

site_build <- function(dir, file = "site.R", name = "index.html", variables = NULL,
                       options = list(), bundle_data = FALSE, bundle_libs = FALSE, libs_overwrite = FALSE, libs_base_only = FALSE,
                       open_after = FALSE, aggregate = TRUE, sparse_time = TRUE, force = FALSE, version = "v1", parent = NULL,
                       include_api = FALSE, endpoint = NULL, tag_id = NULL, serve = FALSE, host = "127.0.0.1", port = 3000) {
  if (missing(dir)) cli_abort('{.arg dir} must be specified (e.g., dir = ".")')
  page <- paste0(dir, "/", file)
  if (!file.exists(page)) cli_abort("{.file {page}} does not exist")
  out <- paste(c(dir, "docs", name), collapse = "/")
  data_preprocess <- function(aggregate) {
    ddir <- paste0(dir, "/docs/data/")
    f <- paste0(ddir, "datapackage.json")
    path <- paste0(dir, "/docs/")
    info <- meta <- list()
    vars <- variables
    if (!is.null(parent) && (force || !file.exists(f) || file.size(f) < 250)) {
      if (file.exists(paste0(parent, "/docs/data/datapackage.json"))) {
        f <- paste0(parent, "/docs/data/datapackage.json")
      } else {
        tryCatch(download.file(paste0(parent, "/data/datapackage.json"), f, quiet = TRUE), error = function(e) NULL)
      }
    }
    time_vars <- NULL
    if (file.exists(f)) {
      meta <- read_json(f)
      previous_data <- list()
      ids_maps <- list()
      child <- id_lengths <- NULL
      dataset_order <- order(-vapply(meta$resources, "[[", 0, "bytes"))
      var_codes <- unique(unlist(lapply(meta$resources, function(d) vapply(d$schema$fields, "[[", "", "name")), use.names = FALSE))
      var_codes <- structure(paste0("X", seq_along(var_codes)), names = var_codes)
      for (oi in seq_along(dataset_order)) {
        i <- dataset_order[oi]
        d <- meta$resources[[i]]
        time_info <- list()
        temp <- list()
        time_vars <- c(time_vars, d$time)
        for (v in d$schema$fields) {
          if ((length(d$time) && v$name == d$time[[1]]) || v$name %in% vars) {
            temp[[v$name]] <- v
            if (length(d$time) && v$name == d$time[[1]]) time_info <- v
          }
        }
        if (length(variables)) {
          vars <- vars[vars %in% names(temp)]
          if (!identical(vars, variables)) {
            cli_warn(paste0(
              "{?a requested variable was/some requested variables were} not present in {.file ", d$filename, "}:",
              " {.val {variables[!variables %in% vars]}}"
            ))
          }
          d$schema$fields <- unname(temp[vars])
        }
        if (!is.null(parent)) {
          d$site_file <- paste0(parent, "/", d$name, ".json")
        } else {
          file <- paste0(ddir, d$filename)
          d$site_file <- paste0(d$name, ".json")
          path <- paste0(dir, "/docs/", d$site_file)
          if (file.exists(file)) {
            if (force || (!file.exists(path) || file.mtime(file) > file.mtime(path))) {
              vars <- vapply(d$schema$fields, "[[", "", "name")
              sep <- if (grepl(".csv", file, fixed = TRUE)) "," else "\t"
              cols <- scan(file, "", nlines = 1, sep = sep, quiet = TRUE)
              add_id <- length(d$ids) && !d$ids[[1]]$variable %in% vars
              if (add_id) vars <- c(d$ids[[1]]$variable, vars)
              if (length(vars) == length(cols) && all(vars %in% cols)) {
                types <- vapply(d$schema$fields, function(e) if (e$type == "string") "c" else "n", "")
                if (add_id) types <- c("c", types)
                data <- as.data.frame(read_delim_arrow(
                  gzfile(file), sep,
                  col_names = vars, col_types = paste(types, collapse = ""), skip = 1
                ))
              } else {
                data <- read_delim_arrow(gzfile(file), sep)
                for (col in colnames(data)) {
                  v <- data[[col]]
                  if (!is.numeric(v) && !is.character(v)) data[[col]] <- as.character(v)
                }
              }
              time <- NULL
              if (length(d$time) && d$time[[1]] %in% colnames(data)) {
                time <- d$time[[1]]
                data <- data[order(data[[d$time[[1]]]]), ]
              }
              if (length(d$ids) && d$ids[[1]]$variable %in% colnames(data)) {
                ids <- gsub("^\\s+|\\s+$", "", format(data[[d$ids[[1]]$variable]], scientific = FALSE))
                if (is.null(time) && anyDuplicated(ids)) {
                  cli_abort(paste(
                    "no time variable was specified, yet {?an id was/ids were} duplicated:",
                    "{.val {unique(ids[duplicated(ids)])}}"
                  ))
                }
                data <- data[, colnames(data) != d$ids[[1]]$variable, drop = FALSE]
              } else {
                ids <- rownames(data)
              }
              rownames(data) <- NULL
              sdata <- split(data, ids)
              # aggregating if needed
              pn <- nchar(names(sdata)[1])
              fixed_ids <- pn > 1 && all(nchar(names(sdata)) == pn) && !any(grepl("[^0-9]", names(sdata)))
              aggregated <- FALSE
              if (aggregate && length(previous_data) && anyNA(data)) {
                cn <- colnames(sdata[[1]])
                ids_map <- NULL
                if (length(d$ids)) {
                  if (is.character(d$ids[[1]]$map)) {
                    mf <- paste0(c(dir, ""), rep(c("", "/docs/"), each = 2), "/", d$ids[[1]]$map)
                    mf <- mf[file.exists(mf)]
                    ids_map <- if (!is.null(ids_maps[[d$ids[[1]]$map]])) {
                      ids_maps[[d$ids[[1]]$map]]
                    } else {
                      tryCatch(
                        read_json(if (length(mf)) mf[[1]] else d$ids[[1]]$map),
                        error = function(e) cli_alert_warning("failed to read ID map: {e$message}")
                      )
                    }
                    ids_maps[[d$ids[[1]]$map]] <- ids_map
                    if (((length(mf) && !grepl("/docs/", mf[[1]], fixed = TRUE)) || bundle_data) &&
                      !is.null(ids_map)) {
                      d$ids[[1]]$map <- ids_map
                    }
                  } else {
                    ids_map <- d$ids[[1]]$map
                  }
                }
                cids <- NULL
                for (pname in rev(names(previous_data))) {
                  if (pname %in% names(ids_map) && length(ids_map[[pname]]) && !is.null(ids_map[[pname]][[1]][[d$name]])) {
                    child <- pname
                    cids <- vapply(ids_map[[pname]], function(e) {
                      if (is.null(e[[d$name]])) "" else e[[d$name]]
                    }, "")[names(previous_data[[pname]])]
                    break
                  } else if (fixed_ids && pname %in% names(id_lengths) && id_lengths[[pname]] > pn) {
                    child <- pname
                    cids <- substr(names(previous_data[[pname]]), 1, pn)
                    break
                  }
                }
                if (!is.null(child) && any(cn %in% names(previous_data[[child]][[1]])) && !is.null(cids)) {
                  for (id in names(sdata)) {
                    did <- sdata[[id]]
                    if (anyNA(did)) {
                      children <- which(cids == id)
                      if (length(children)) {
                        cd <- do.call(rbind, previous_data[[child]][children])
                        if (is.null(time)) {
                          aggs <- vapply(cd, function(v) if (is.numeric(v) && !all(is.na(v))) mean(v, na.rm = TRUE) else NA, 0)
                          aggs <- aggs[!is.na(aggs) & names(aggs) %in% cn & names(aggs) != "time"]
                          aggs <- aggs[is.na(sdata[[id]][, names(aggs)])]
                          if (length(aggs)) {
                            aggregated <- TRUE
                            sdata[[id]][, names(aggs)] <- aggs
                          }
                        } else {
                          cd <- split(cd, cd[[time]])
                          for (ct in names(cd)) {
                            aggs <- vapply(cd[[ct]], function(v) if (is.numeric(v) && !all(is.na(v))) mean(v, na.rm = TRUE) else NA, 0)
                            aggs <- aggs[!is.na(aggs) & names(aggs) %in% cn]
                            if (length(aggs)) {
                              su <- sdata[[id]][[time]] == ct
                              aggs <- aggs[is.na(sdata[[id]][su, names(aggs)])]
                              if (length(aggs)) {
                                aggregated <- TRUE
                                sdata[[id]][su, names(aggs)] <- aggs
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
              data <- do.call(rbind, sdata)
              times <- if (is.null(time)) rep(1, nrow(data)) else data[[time]]
              ntimes <- length(unique(times))
              if (fixed_ids) id_lengths[d$name] <- pn
              previous_data[[d$name]] <- sdata
              evars <- vars
              if (!length(evars)) evars <- colnames(data)[colnames(data) %in% names(var_codes)]
              if (!is.null(time) && time %in% evars) evars <- evars[evars != time]
              evars <- evars[evars %in% names(var_codes)]
              var_meta <- lapply(evars, function(vn) {
                list(
                  code = var_codes[[vn]],
                  time_range = if (sparse_time) {
                    v <- data[[vn]]
                    range <- which(unname(tapply(v, times, function(v) any(!is.na(v))))) - 1
                    if (length(range)) {
                      range[c(1, length(range))]
                    } else {
                      if (aggregate) cli_warn("no observations of {vn} in {d$filename}")
                      c(-1, -1)
                    }
                  } else {
                    c(0, ntimes - 1)
                  }
                )
              })
              names(var_meta) <- evars
              sdata <- lapply(sdata, function(e) {
                e <- e[, evars]
                e <- as.list(e)
                if (sparse_time) {
                  for (f in evars) {
                    if (f %in% names(e)) {
                      e[[f]] <- if (var_meta[[f]]$time_range[[1]] == -1 || all(is.na(e[[f]]))) {
                        NULL
                      } else {
                        e[[f]][seq(var_meta[[f]]$time_range[[1]], var_meta[[f]]$time_range[[2]]) + 1]
                      }
                    }
                  }
                }
                names(e) <- var_codes[names(e)]
                e
              })
              sdata[["_meta"]] <- list(
                time = list(
                  value = unique(times),
                  name = d$time
                ),
                variables = Filter(function(l) l$time_range[1] != -1 && l$time_range[2] != -1, var_meta)
              )
              write_json(sdata, path, dataframe = "columns", auto_unbox = TRUE)
            }
          }
        }
        info[[d$name]] <- d
      }
    } else {
      data_files <- list.files(ddir, "\\.(?:csv|tsv|txt)")
      if (length(data_files)) {
        init_data(sub("^.*/", "", normalizePath(dir, "/", FALSE)), dir = dir, path = data_files)
        if (file.exists(f)) {
          return(data_preprocess(aggregate))
        }
      }
    }
    list(
      package = if (file.exists(f)) sub(paste0(dir, "/docs/"), "", f, fixed = TRUE),
      datasets = if (length(meta$resources) == 1) list(names(info)) else names(info),
      variables = vars[!vars %in% time_vars],
      info = info,
      files = vapply(info, "[[", "", "filename")
    )
  }
  path <- paste0(dir, "/docs/settings.json")
  settings <- if (file.exists(path) && file.size(path)) {
    read_json(path, auto_unbox = TRUE)
  } else {
    list(settings = options)
  }
  defaults <- list(
    digits = 2, summary_selection = "all", color_by_order = FALSE, boxplots = TRUE,
    theme_dark = FALSE, partial_init = TRUE, palette = "vik", hide_url_parameters = FALSE,
    background_shapes = TRUE, iqr_box = TRUE, polygon_outline = 1.5, color_scale_center = "none",
    table_autoscroll = TRUE, table_scroll_behavior = "smooth", hide_tooltips = FALSE,
    map_animations = "all", trace_limit = 20, map_overlay = TRUE, circle_radius = 7,
    tracking = FALSE
  )
  for (s in names(defaults)) {
    if (!is.null(options[[s]])) {
      settings$settings[[s]] <- options[[s]]
    } else if (is.null(settings$settings[[s]])) settings$settings[[s]] <- defaults[[s]]
  }
  times <- unname(vapply(settings$metadata$info, function(d) if (length(d$time)) d$time else "", ""))
  times <- times[times != ""]
  if (!is.null(variables)) variables <- variables[!grepl("^_", variables)]
  if (!missing(aggregate) || (length(variables) && !is.null(settings$metadata) && length(settings$metadata$variables) &&
    !identical(as.character(settings$metadata$variables), variables[!variables %in% times]))) {
    force <- TRUE
  }
  if (!is.null(variables)) variables <- unique(c(times, variables))
  settings$metadata <- if (file.exists(paste0(dir, "/docs/data/datapackage.json"))) data_preprocess(aggregate) else list()
  coverage_file <- paste0(dir, "/docs/data/coverage.csv")
  if (file.exists(coverage_file)) {
    coverage <- read.csv(coverage_file, row.names = 1)
    have_metadata <- unique(unlist(lapply(settings$metadata$info, function(d) {
      vapply(d$schema$fields, function(e) if (!is.null(e$info$full_name)) e$name else "", "")
    }), use.names = TRUE))
    if (length(have_metadata)) {
      metadata_bin <- structure(numeric(nrow(coverage)), names = rownames(coverage))
      metadata_bin[have_metadata[have_metadata %in% names(metadata_bin)]] <- 1
      if (is.null(coverage$metadata) || !all(coverage$metadata == metadata_bin)) {
        write.csv(cbind(metadata = metadata_bin, coverage[, colnames(coverage) != "metadata"]), coverage_file)
      }
    }
  }
  parts <- make_build_environment()
  stable <- version == "v1" || version == "stable"
  parts$dependencies <- c(
    if (stable) {
      list(
        base_style = list(type = "stylesheet", src = "https://uva-bi-sdad.github.io/community/dist/css/community.v1.min.css"),
        base = list(type = "script", src = "https://uva-bi-sdad.github.io/community/dist/js/community.v1.min.js")
      )
    } else if (version == "local") {
      list(
        base_style = list(type = "stylesheet", src = "dist/dev/community.css"),
        base = list(type = "script", src = "dist/dev/community.js")
      )
    } else {
      if (grepl("^http", version)) {
        list(
          base_style = list(type = "stylesheet", src = sub("//", "/", paste0(version, "/community.css"), fixed = TRUE)),
          base = list(type = "script", src = sub("//", "/", paste0(version, "/community.js"), fixed = TRUE))
        )
      } else {
        list(
          base_style = list(type = "stylesheet", src = "https://uva-bi-sdad.github.io/community/dist/css/community.min.css"),
          base = list(type = "script", src = "https://uva-bi-sdad.github.io/community/dist/js/community.min.js")
        )
      }
    },
    c(
      lapply(structure(names(cache_scripts), names = names(cache_scripts)), function(f) {
        cached <- cache_scripts[[f]][[if (stable) "stable" else "dev"]]
        dir.create(paste0(dir, "/", cached$location), FALSE, TRUE)
        scripts <- paste0(sub("(?:\\.v1)?(?:\\.min)?\\.js", "", basename(cached$source)), c("", ".min", ".v1.min"), ".js")
        script <- scripts[stable + 2]
        lf <- paste0(dir, "/", cached$location, "/", script)
        lff <- paste0("dist/dev/", sub(".min", "", script, fixed = TRUE))
        if (version == "local") {
          file.copy(paste0(dir, "/docs/", lff), lf)
          if (file.exists(lf)) list(type = "script", src = lff)
        } else {
          lff <- paste0(dir, "/docs/dist/docs/dist/js/", script)
          if (file.exists(lff) && md5sum(lff)[[1]] == cached$md5) file.copy(lff, lf)
          unlink(paste0(dir, "/", cached$location, "/", scripts[scripts != script]))
          if (!file.exists(lf) || md5sum(lf)[[1]] != cached$md5) {
            tryCatch(download.file(cached$source, lf, quiet = TRUE), error = function(e) NULL)
          }
          if (!file.exists(lf)) cli_abort("failed to download script from {cached$source}")
          list(type = "script", src = sub("^.*docs/", "", lf))
        }
      }),
      if (!is.null(tag_id)) {
        list(ga = list(type = "script", src = paste0("https://www.googletagmanager.com/gtag/js?id=", tag_id)))
      },
      list(
        custom_style = list(type = "stylesheet", src = "style.css"),
        custom = list(type = "script", src = "script.js"),
        bootstrap_style = list(
          type = "stylesheet",
          src = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css",
          hash = "sha384-GLhlTQ8iRABdZLl6O3oVMWSktQOp6b7In1Zl3/Jr59b6EGGoI1aFkw7cmDA6j6gD"
        ),
        bootstrap = list(
          type = "script",
          src = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js",
          hash = "sha384-w76AqPfDkMBDXo30jS1Sgez6pr3x5MlQ1ZAGC+nuZB+EYdgRZgiwxhTBTkF7CXvN"
        )
      )
    )
  )
  parts$credits$bootstrap <- list(
    name = "Bootstrap",
    url = "https://getbootstrap.com",
    version = "5.3.0"
  )
  parts$credits$colorbrewer <- list(
    name = "ColorBrewer",
    url = "https://colorbrewer2.org",
    description = "Discrete color palettes"
  )
  parts$credits$scico <- list(
    name = "Scico",
    url = "https://github.com/thomasp85/scico",
    description = "Implementation of color palettes by Fabio Crameri"
  )
  src <- parse(text = gsub("community::site_build", "site_build", readLines(page, warn = FALSE), fixed = TRUE))
  source(local = parts, exprs = src)
  libdir <- paste0(dir, "/docs/lib/")
  if (missing(bundle_libs)) bundle_libs <- libs_overwrite || libs_base_only
  if (bundle_libs) {
    dir.create(libdir, FALSE)
    manifest_file <- paste0(libdir, "manifest.json")
    manifest <- if (file.exists(manifest_file)) read_json(manifest_file) else list()
    for (dn in names(parts$dependencies)) {
      if (if (libs_base_only) dn %in% c("base", "base_style") else !grepl("^(?:ga$|custom|data_handler)", dn)) {
        d <- parts$dependencies[[dn]]
        f <- paste0("lib/", dn, "/", basename(d$src))
        if (is.null(manifest[[dn]])) manifest[[dn]] <- list(file = f, source = d$src)
        lf <- paste0(dir, "/docs/", f)
        stale <- libs_overwrite || d$src != manifest[[dn]]$source
        if (!file.exists(lf) || stale) {
          if (stale) unlink(dirname(lf), TRUE)
          dir.create(dirname(lf), FALSE)
          loc <- paste0(dir, "/docs/", d$src)
          if (file.exists(loc)) {
            file.copy(loc, lf)
          } else {
            download.file(d$src, lf)
          }
          manifest[[dn]] <- list(file = f, source = d$src)
        }
        map <- readLines(lf, warn = FALSE)
        map <- map[length(map)]
        if (grepl("sourceMappingURL", map, fixed = TRUE)) {
          mf <- paste0(dirname(lf), "/", regmatches(map, regexec("=([^ ]+)", map))[[1]][2])
          if (!file.exists(mf)) {
            download.file(paste0(dirname(d$src), "/", basename(mf)), mf)
          }
        }
        parts$dependencies[[dn]]$src <- f
        parts$dependencies[[dn]]$hash <- NULL
      }
    }
    write_json(manifest, manifest_file, auto_unbox = TRUE, pretty = TRUE)
  } else {
    unlink(libdir, TRUE)
  }
  for (e in c(
    "rules", "variables", "dataviews", "info", "text", "select", "combobox", "button", "datatable",
    "table", "plotly", "echarts", "map", "legend", "credits", "credit_output"
  )) {
    settings[[e]] <- if (length(parts[[e]])) if (is.list(parts[[e]])) parts[[e]] else list(parts[[e]]) else NULL
    if (!is.null(names(settings[[e]]))) settings[[e]] <- settings[[e]][!duplicated(names(settings[[e]]))]
  }
  if (!is.null(settings$map)) {
    settings$map[["_raw"]] <- list()
    for (m in settings$map) {
      if (!is.null(m$shapes)) {
        for (s in m$shapes) {
          if (!is.null(s$url) && file.exists(s$url)) {
            settings$map[["_raw"]][[s$url]] <- paste(readLines(s$url), collapse = "")
          }
        }
        for (v in m$overlays) {
          for (s in v$source) {
            if (!is.list(s)) s <- list(url = s)
            if (!is.null(s$url) && file.exists(s$url) && !s$url %in% names(settings$map[["_raw"]])) {
              settings$map[["_raw"]][[s$url]] <- paste(readLines(s$url), collapse = "")
            }
          }
        }
      }
    }
  }
  if (!is.null(endpoint)) settings$endpoint <- endpoint
  if (!is.null(tag_id)) settings$tag_id <- tag_id
  write_json(settings, paste0(dir, "/docs/settings.json"), pretty = TRUE, auto_unbox = TRUE)
  if (include_api || file.exists(paste0(dir, "/docs/functions/api.js"))) {
    dir.create(paste0(dir, "/docs/functions"), FALSE, TRUE)
    writeLines(c(
      "'use strict'",
      paste0("const DataHandler = require('../", if (version == "local") {
        parts$dependencies$data_handler$src
      } else {
        basename(parts$dependencies$data_handler$src)
      }, "'),"),
      "  data = new DataHandler(require('../settings.json'), void 0, {",
      paste0(
        "    ",
        vapply(settings$metadata$datasets, function(f) paste0(f, ": require('../", f, ".json')"), ""),
        ","
      ),
      "  })",
      "module.exports.handler = async function (event) {",
      "  return data.export(event.queryStringParameters)",
      "}"
    ), paste0(dir, "/docs/functions/api.js"))
  }
  last_deps <- grep("^(?:custom|base)", names(parts$dependencies))
  r <- c(
    "<!doctype html>",
    paste("<!-- page generated from", sub("^.*/", "", file), "by community::site_build() -->"),
    '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">',
    "<head>",
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    paste0(
      '<script type="application/javascript">\nconst site = ',
      toJSON(settings, auto_unbox = TRUE),
      "\n</script>"
    ),
    if (bundle_data) {
      paste0(
        '<script type="application/javascript">\nsite.data = {\n',
        paste(
          vapply(settings$metadata$datasets, function(f) {
            paste0('"', f, '": ', paste(
              readLines(paste0(dir, "/docs/", f, ".json"), warn = FALSE),
              collapse = ""
            ), ",\n")
          }, ""),
          collapse = ""
        ),
        "}\n</script>"
      )
    },
    unlist(lapply(parts$dependencies[c(seq_along(parts$dependencies)[-last_deps], last_deps)], head_import, dir = dir)),
    paste0('<meta name="generator" content="community v', packageVersion("community"), '" />'),
    unlist(parts$head[!duplicated(names(parts$head))], use.names = FALSE),
    "</head>",
    "<body>",
    '<div id="site_wrap" style="visibility: hidden; position: absolute; height: 100%; left: 0; right: 0">',
    if (!is.null(parts$header)) parts$header,
    if (!is.null(parts$body)) parts$body,
    '<div class="content container-fluid">',
    if (!is.null(parts$content)) parts$content,
    "</div>",
    "</div>",
    paste0(
      '<div id="load_screen" style="position: absolute; top: 0; right: 0; bottom: 0; left: 0; background-color: inherit">',
      '<div class="d-flex justify-content-center align-items-center" style="height: 50%">',
      '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>',
      "</div>",
      '<noscript style="width: 100%; text-align: center; padding: 5em">Please enable JavaScript to view this site.</noscript>',
      "</div>"
    ),
    parts$script,
    "</body>",
    "</html>"
  )
  writeLines(r, out)
  cli_bullets(c(v = paste("built", name, "file:"), "*" = paste0("{.path ", out, "}")))
  if (serve) site_start_server(dir, host, port, open_after)
  if (open_after) viewer(if (serve) paste0("http://", host, ":", port) else out)
  invisible(out)
}
