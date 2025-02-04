#' Reformat an SDAD-formatted dataset
#'
#' Unify multiple files, which each contain a tall set of variables associated with regions.
#'
#' The basic assumption is that there are (a) entities which (b) exist in a hierarchy, and
#' (c1) have a static set of features and (c2) a set of variable features which
#' (d) are assessed at multiple time points.
#'
#' For example (and generally), entities are (a) regions, with (b) smaller regions making up larger regions,
#' and which (c1) have names, and (c2) population and demographic counts (d) between 2009 and 2019.
#'
#' @param files A character vector of file paths, or the path to a directory containing data files.
#' @param out Path to a directory to write files to; if not specified, files will not be written.
#' @param variables Vector of variable names (in the \code{value_name} column) to be included.
#' @param ids Vector of IDs (in the \code{id} column) to be included.
#' @param value Name of the column containing variable values.
#' @param value_name Name of the column containing variable names; assumed to be a single variable per file if
#' not present.
#' @param id Column name of IDs which uniquely identify entities.
#' @param time Column name of the variable representing time.
#' @param dataset Column name used to separate entity scales.
#' @param entity_info A list containing variable names to extract and create an ids map from (
#' \code{entity_info.json}, created in the output directory). Entries can be named to rename the
#' variables they refer to in entity features.
#' @param formatters A list of functions to pass columns through, with names identifying those columns
#' (e.g., \code{list(region_name = function(x) sub(",.*$", "", x))} to strip text after a comma in the
#' "region_name" column).
#' @param compression A character specifying the type of compression to use on the created files,
#' between \code{"gzip"}, \code{"bzip2"}, and \code{"xz"}. Set to \code{FALSE} to disable compression.
#' @param read_existing Logical; if \code{FALSE}, will not read in existing sets.
#' @param overwrite Logical; if \code{TRUE}, will overwrite existing reformatted files, even if
#' the source files are older than it.
#' @param get_coverage Logical; if \code{FALSE}, will not calculate a summary of variable coverage (\code{coverage.csv}).
#' @param verbose Logical; if \code{FALSE}, will not print status messages.
#' @examples
#' \dontrun{
#' data_reformat_sdad("data/directory")
#' }
#' @return An invisible list of the unified variable datasets, split into datasets.
#' @export

data_reformat_sdad <- function(files, out = NULL, variables = NULL, ids = NULL, value = "value", value_name = "measure",
                               id = "geoid", time = "year", dataset = "region_type",
                               entity_info = c(type = "region_type", name = "region_name"),
                               formatters = NULL, compression = "xz", read_existing = TRUE, overwrite = FALSE,
                               get_coverage = TRUE, verbose = TRUE) {
  if (length(files) == 1 && dir.exists(files)) {
    files <- list.files(files, full.names = TRUE)
  }
  if (any(!file.exists(files))) {
    files <- files[!file.exists(files)]
    cli_abort("file{? does/s do} not exist: {files}")
  }
  vars <- c(value, value_name, id, time, dataset)
  spec <- c(
    missing(value), missing(value_name), missing(id), missing(time), missing(dataset),
    rep(missing(entity_info), length(entity_info))
  )
  data <- list()
  names <- list()
  if (verbose) cli_progress_step("reading in {length(files)} original file{?s}")
  max_age <- max(file.mtime(files))
  check_variables <- check_ids <- FALSE
  if (length(ids)) {
    check_ids <- TRUE
    ids <- unique(as.character(ids))
  }
  for (f in files) {
    d <- tryCatch(
      read_delim_arrow(gzfile(f), if (grepl(".csv", f, fixed = TRUE)) "," else "\t"),
      error = function(e) NULL
    )
    if (is.null(d)) {
      if (verbose) cli_warn("failed to read in file: {f}")
      next
    }
    if (!id %in% colnames(d)) {
      if (verbose) cli_warn("file has no ID column: {f}")
      next
    }
    if (anyNA(d[[id]])) d <- d[!is.na(d[[id]]), ]
    if (!nrow(d)) {
      if (verbose) cli_warn("file has no observations: {f}")
      next
    }
    lcols <- tolower(colnames(d))
    if (any(!vars %in% colnames(d))) {
      l <- !colnames(d) %in% vars & lcols %in% vars
      colnames(d)[l] <- lcols[l]
    }
    d[[id]] <- as.character(d[[id]])
    if (check_ids) {
      su <- !grepl("[^0-9.e+-]", d[[id]])
      if (any(su)) {
        d[[id]][su] <- gsub("^\\s+|\\s+$", "", format(as.numeric(d[[id]][su]), scientific = FALSE))
      }
      d <- d[d[[id]] %in% ids, ]
      if (!nrow(d)) {
        if (verbose) cli_warn("file has none of the requested IDs: {f}")
        next
      }
    }
    if (any(su <- !vars %in% colnames(d))) {
      if (all(su)) {
        cli_warn("no variables found in file {f}")
        next
      }
      if (any(!spec[su])) {
        cli_warn(
          "table from {f} does not have {?a column name/column names} {.var {vars[su][!spec[su]]}}"
        )
        next
      }
      vars <- vars[!su]
      spec <- spec[!su]
    }
    names <- c(names, list(colnames(d)))
    d$file <- f
    data <- c(data, list(d))
    names(data)[length(data)] <- f
  }
  if (verbose) cli_progress_done()
  common <- Reduce(intersect, names)
  if (!value %in% vars) {
    a <- common[!common %in% vars]
    if (!length(a)) cli_abort("could not figure out which column might contain values")
    if (length(a) > 1) a <- a[which(vapply(a, function(col) is.numeric(d[[col]]), TRUE))]
    if (!length(a)) {
      cli_abort(c(
        "no potential value columns were numeric",
        i = "check variable classes, or specify {.arg value}"
      ))
    }
    value <- a[1]
    vars <- c(value, vars)
  }
  vars <- unique(c(vars, entity_info, "file"))
  if (length(variables)) {
    check_variables <- TRUE
    variables <- unique(as.character(variables))
  }
  data <- do.call(rbind, lapply(names(data), function(f) {
    d <- data[[f]]
    d[, vars[!vars %in% colnames(d)]] <- ""
    d <- d[, vars]
    if (anyNA(d)) d <- d[rowSums(is.na(d)) == 0, ]
    if (check_variables) {
      ovars <- unique(d[[value_name]])
      su <- !ovars %in% variables
      if (any(su)) {
        names(ovars) <- ovars
        ovars[] <- make_full_name(f, ovars)
        su <- su & ovars %in% variables
        for (i in which(su)) d[[value_name]][d[[value_name]] == names(ovars)[i]] <- ovars[i]
      }
      d <- d[d[[value_name]] %in% variables, ]
    }
    d
  }))
  if (!nrow(data)) cli_abort("no datasets contained selected variables and/or IDs")
  cn <- colnames(data)
  if (!is.null(formatters)) {
    for (n in names(formatters)) {
      if (n %in% cn) {
        data[[n]] <- formatters[[n]](data[[n]])
      }
    }
  }
  if (!id %in% vars) {
    id <- "id"
    vars <- c(id, vars)
    data <- cbind(id = unlist(lapply(table(data$file), seq_len), use.names = FALSE), data)
  }
  data[[id]] <- as.character(data[[id]])
  if (!dataset %in% vars) {
    dataset <- "dataset"
    data$dataset <- dataset
  }
  if (!time %in% vars) {
    time <- "time"
    data$time <- 1
  }
  if (!any(value_name %in% vars)) {
    value_name <- "file"
  }
  data[[dataset]] <- gsub("\\s+", "_", data[[dataset]])
  datasets <- sort(unique(data[[dataset]]))
  present_vars <- unique(data[[value_name]])
  if (check_variables) {
    present_vars <- variables[variables %in% present_vars]
    if (verbose) {
      absent_variables <- variables[!variables %in% present_vars]
      if (length(absent_variables)) cli_warn("requested variable{?s} not found in datasets: {.val {absent_variables}}")
    }
  }
  times <- sort(unique(data[[time]]))
  if (all(nchar(times) == 4)) times <- seq(min(times), max(times))
  n <- length(times)
  if (!is.null(out)) {
    files <- paste0(out, "/", gsub("\\s+", "_", tolower(datasets)), ".csv")
    if (is.character(compression) && grepl("^[gbx]", compression, FALSE)) {
      compression <- tolower(substr(compression, 1, 1))
      files <- paste0(files, ".", c(g = "gz", b = "bz2", x = "xz")[[compression]])
    } else {
      compression <- FALSE
    }
    names(files) <- datasets
  }
  write <- vapply(files, function(f) is.null(out) || overwrite || !file.exists(f) || max_age > file.mtime(f), TRUE)
  if (!is.null(out) && (is.list(entity_info) || is.character(entity_info))) {
    entity_info_file <- paste0(out, "/entity_info.json")
    if (overwrite || !file.exists(entity_info_file) || any(write)) {
      entity_info <- as.list(entity_info)
      entity_info <- entity_info[unlist(entity_info) %in% colnames(data)]
      if (length(entity_info)) {
        if (verbose) {
          cli_progress_step(
            "writing entity file",
            msg_done = paste0("wrote entity metadata file: {.file ", entity_info_file, "}")
          )
        }
        e <- data[, unique(c(id, dataset, unlist(entity_info))), drop = FALSE]
        if (!is.null(names(entity_info))) {
          for (en in names(entity_info)) {
            if (en != "" && entity_info[[en]] %in% colnames(e)) colnames(e)[colnames(e) == entity_info[[en]]] <- en
          }
        }
        write_json(
          lapply(split(e, e[, 2]), function(g) {
            lapply(
              split(g[, -(1:2), drop = FALSE], g[, 1]),
              function(l) lapply(l, function(r) r[which(r != "")[1]])
            )
          }),
          entity_info_file,
          auto_unbox = TRUE
        )
        if (verbose) cli_progress_done()
      }
    }
  }
  sets <- lapply(datasets, function(dn) {
    if (write[[dn]]) {
      d <- if (dataset %in% vars) data[data[[dataset]] == dn, ] else data
      dc <- list()
      ids <- unique(d[[id]])
      i <- 1
      if (verbose) {
        cli_progress_step(
          "creating {dn} dataset (ID {i}/{length(ids)})",
          msg_done = "created {dn} dataset ({length(ids)} IDs)", spinner = TRUE
        )
      }
      for (i in seq_along(ids)) {
        if (verbose) cli_progress_update()
        e <- ids[[i]]
        ed <- d[d[[id]] == e, ]
        ed <- ed[!duplicated(do.call(paste, ed[, vars[2:4]])), ]
        r <- data.frame(
          ID = rep(as.character(e), n), time = times, check.names = FALSE,
          matrix(NA, n, length(present_vars), dimnames = list(times, present_vars))
        )
        if (all(c(value_name, value) %in% names(ed))) {
          for (v in present_vars) {
            su <- ed[[value_name]] == v
            su[su] <- !is.na(ed[[value]][su])
            if (sum(su)) {
              vals <- ed[su, ]
              r[as.character(vals[[time]]), v] <- vals[[value]]
            }
          }
        }
        rownames(r) <- NULL
        dc[[i]] <- r
      }
      do.call(rbind, dc)
    } else if (read_existing && file.exists(files[[dn]])) {
      if (verbose) cli_progress_step("reading in existing {dn} dataset", msg_done = "read existing {dn} dataset")
      read.csv(gzfile(files[[dn]]), check.names = FALSE)
    }
  })
  names(sets) <- datasets
  if (!is.null(out)) {
    if (get_coverage && read_existing) {
      variables <- sort(if (length(variables)) variables else unique(unlist(lapply(sets, colnames), use.names = FALSE)))
      allcounts <- structure(numeric(length(variables)), names = variables)
      write.csv(vapply(sets, function(d) {
        counts <- colSums(!is.na(d))
        counts <- counts[names(counts) %in% variables]
        allcounts[names(counts)] <- counts
        allcounts
      }, numeric(length(variables))), paste0(out, "/coverage.csv"))
    }
    if (any(write)) {
      if (verbose) cli_progress_step("writing data files", msg_done = "wrote reformatted datasets:")
      for (i in seq_along(sets)) {
        if (write[[i]]) {
          if (is.character(compression)) o <- do.call(paste0(compression, "zfile"), list(files[[i]]))
          write.csv(sets[[i]], o, row.names = FALSE)
        }
      }
      if (verbose) {
        cli_progress_done()
        cli_bullets(structure(
          paste0("{.file ", files[write], "}"),
          names = rep("*", sum(write))
        ))
      }
    } else if (verbose) {
      cli_bullets(c(
        v = "all files are already up to date:",
        structure(paste0("{.file ", files, "}"), names = rep("*", length(files)))
      ))
    }
  }
  invisible(sets)
}
