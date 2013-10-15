

/**
 * Create an Ajax call based on the table's settings, taking into account that
 * parameters can have multiple forms, and backwards compatibility.
 *
 * @param {object} oSettings dataTables settings object
 * @param {array} data Data to send to the server, required by
 *     DataTables - may be augmented by developer callbacks
 * @param {function} fn Callback function to run when data is obtained
 */
function _fnBuildAjax( oSettings, data, fn )
{
	// Compatibility with 1.9-, allow fnServerData and event to manipulate
	_fnCallbackFire( oSettings, 'aoServerParams', 'serverParams', [data] );

	// Convert to object based for 1.10+ if using the old scheme
	if ( data && data.__legacy ) {
		var tmp = {};
		$.each( data, function (key, val) {
			tmp[val.name] = val.value;
		} );
		data = tmp;
	}

	var ajaxData;
	var ajax = oSettings.ajax;
	var instance = oSettings.oInstance;

	if ( $.isPlainObject( ajax ) && ajax.data )
	{
		ajaxData = ajax.data;

		var newData = $.isFunction( ajaxData ) ?
			ajaxData( data ) :  // fn can manipulate data or return an object
			ajaxData;           // object or array to merge

		// If the function returned an object, use that alone
		data = $.isFunction( ajaxData ) && newData ?
			newData :
			$.extend( true, data, newData );

		// Remove the data property as we've resolved it already and don't want
		// jQuery to do it again (it is restored at the end of the function)
		delete ajax.data;
	}

	var baseAjax = {
		"data": data,
		"success": function (json) {
			var error = json.error || json.sError;
			if ( error ) {
				oSettings.oApi._fnLog( oSettings, 0, error );
			}

			oSettings.json = json;
			$(instance).trigger('xhr', [oSettings, json]);
			fn( json );
		},
		"dataType": "json",
		"cache": false,
		"type": oSettings.sServerMethod,
		"error": function (xhr, error, thrown) {
			if ( error == "parsererror" ) {
				oSettings.oApi._fnLog( oSettings, 0, 'Invalid JSON response', 1 );
			}
		}
	};

	if ( oSettings.fnServerData )
	{
		// DataTables 1.9- compatibility
		oSettings.fnServerData.call( instance,
			oSettings.sAjaxSource, data, fn, oSettings
		);
	}
	else if ( oSettings.sAjaxSource || typeof ajax === 'string' )
	{
		// DataTables 1.9- compatibility
		oSettings.jqXHR = $.ajax( $.extend( baseAjax, {
			url: ajax || oSettings.sAjaxSource
		} ) );
	}
	else if ( $.isFunction( ajax ) )
	{
		// Is a function - let the caller define what needs to be done
		oSettings.jqXHR = ajax.call( instance, data, fn, oSettings );
	}
	else
	{
		// Object to extend the base settings
		oSettings.jqXHR = $.ajax( $.extend( baseAjax, ajax ) );

		// Restore for next time around
		ajax.data = ajaxData;
	}
}


/**
 * Update the table using an Ajax call
 *  @param {object} oSettings dataTables settings object
 *  @returns {boolean} Block the table drawing or not
 *  @memberof DataTable#oApi
 */
function _fnAjaxUpdate( oSettings )
{
	if ( oSettings.bAjaxDataGet )
	{
		oSettings.iDraw++;
		_fnProcessingDisplay( oSettings, true );
		var iColumns = oSettings.aoColumns.length;
		var aoData = _fnAjaxParameters( oSettings );

		_fnBuildAjax( oSettings, aoData, function(json) {
			_fnAjaxUpdateDraw( oSettings, json );
		}, oSettings );

		return false;
	}
	return true;
}


/**
 * Build up the parameters in an object needed for a server-side processing
 * request. Note that this is basically done twice, is different ways - a modern
 * method which is used by default in DataTables 1.10 which uses objects and
 * arrays, or the 1.9- method with is name / value pairs. 1.9 method is used if
 * the sAjaxSource option is used in the initialisation, or the legacyAjax
 * option is set.
 *  @param {object} oSettings dataTables settings object
 *  @returns {bool} block the table drawing or not
 *  @memberof DataTable#oApi
 */
function _fnAjaxParameters( settings )
{
	var
		columns = settings.aoColumns,
		columnCount = columns.length,
		features = settings.oFeatures,
		preSearch = settings.oPreviousSearch,
		preColSearch = settings.aoPreSearchCols,
		i, data = [], dataProp, column, columnSearch,
		sort = _fnSortFlatten( settings ),
		displayStart = settings._iDisplayStart,
		displayLength = features.bPaginate !== false ?
			settings._iDisplayLength :
			-1;

	var param = function ( name, value ) {
		data.push( { 'name': name, 'value': value } );
	};

	// DataTables 1.9- compatible method
	param( 'sEcho',          settings.iDraw );
	param( 'iColumns',       columnCount );
	param( 'sColumns',       _pluck( columns, 'sName' ).join(',') );
	param( 'iDisplayStart',  displayStart );
	param( 'iDisplayLength', displayLength );

	// DataTables 1.10+ method
	var d = {
		draw:    settings.iDraw,
		columns: [],
		sort:    [],
		start:   displayStart,
		length:  displayLength,
		filter:  {
			value: preSearch.sSearch,
			regex: preSearch.bRegex
		}
	};

	for ( i=0 ; i<columnCount ; i++ ) {
		column = columns[i];
		columnSearch = preColSearch[i];
		dataProp = typeof column.mData=="function" ? 'function' : column.mData ;

		d.columns.push( {
			data:       dataProp,
			name:       column.sName,
			searchable: column.bSearchable,
			sortable:   column.bSortable,
			filter:     {
				value: columnSearch.sSearch,
				regex: columnSearch.bRegex
			}
		} );

		param( "mDataProp_"+i, dataProp );

		if ( features.bFilter ) {
			param( 'sSearch_'+i,     columnSearch.sSearch );
			param( 'bRegex_'+i,      columnSearch.bRegex );
			param( 'bSearchable_'+i, column.bSearchable );
		}

		if ( features.bSort ) {
			param( 'bSortable_'+i, column.bSortable );
		}
	}

	$.each( sort, function ( i, val ) {
		d.sort.push( { column: val.col, dir: val.dir } );

		param( 'iSortCol_'+i, val.col );
		param( 'sSortDir_'+i, val.dir );
	} );

	if ( features.bFilter ) {
		param( 'sSearch', preSearch.sSearch );
		param( 'bRegex', preSearch.bRegex );
	}

	if ( features.bSort ) {
		param( 'iSortingCols', sort.length );
	}

	data.__legacy = true;
	return settings.sAjaxSource || DataTable.ext.legacy.ajax ?
		data : d;
}


/**
 * Data the data from the server (nuking the old) and redraw the table
 *  @param {object} oSettings dataTables settings object
 *  @param {object} json json data return from the server.
 *  @param {string} json.sEcho Tracking flag for DataTables to match requests
 *  @param {int} json.iTotalRecords Number of records in the data set, not accounting for filtering
 *  @param {int} json.iTotalDisplayRecords Number of records in the data set, accounting for filtering
 *  @param {array} json.aaData The data to display on this page
 *  @param {string} [json.sColumns] Column ordering (sName, comma separated)
 *  @memberof DataTable#oApi
 */
function _fnAjaxUpdateDraw ( settings, json )
{
	// v1.10 uses camelCase variables, while 1.9 uses Hungarian notation.
	// Support both
	var compat = function ( old, modern ) {
		return json[old] !== undefined ? json[old] : json[modern];
	};

	var draw            = compat( 'sEcho',                'draw' );
	var recordsTotal    = compat( 'iTotalRecords',        'recordsTotal' );
	var rocordsFiltered = compat( 'iTotalDisplayRecords', 'recordsFiltered' );

	if ( draw ) {
		// Protect against out of sequence returns
		if ( draw*1 < settings.iDraw ) {
			return;
		}
		settings.iDraw = draw * 1;
	}

	_fnClearTable( settings );
	settings._iRecordsTotal   = parseInt(recordsTotal, 10);
	settings._iRecordsDisplay = parseInt(rocordsFiltered, 10);

	var data = _fnAjaxDataSrc( settings, json );
	for ( var i=0, ien=data.length ; i<ien ; i++ ) {
		_fnAddData( settings, data[i] );
	}
	settings.aiDisplay = settings.aiDisplayMaster.slice();

	settings.bAjaxDataGet = false;
	_fnDraw( settings );

	if ( ! settings._bInitComplete ) {
		_fnInitComplete( settings, json );
	}

	settings.bAjaxDataGet = true;
	_fnProcessingDisplay( settings, false );
}


/**
 * Get the data from the JSON data source to use for drawing a table. Using
 * `_fnGetObjectDataFn` allows the data to be sourced from a property of the
 * source object, or from a processing function.
 *  @param {object} oSettings dataTables settings object
 *  @param  {object} json Data source object / array from the server
 *  @return {array} Array of data to use
 */
function _fnAjaxDataSrc ( oSettings, json )
{
	var dataSrc = $.isPlainObject( oSettings.ajax ) && oSettings.ajax.dataSrc !== undefined ?
		oSettings.ajax.dataSrc :
		oSettings.sAjaxDataProp; // Compatibility with 1.9-.

	// Compatibility with 1.9-. In order to read from aaData, check if the
	// default has been changed, if not, check for aaData
	if ( dataSrc === 'data' ) {
		return json.aaData || json[dataSrc];
	}

	return dataSrc !== "" ?
		_fnGetObjectDataFn( dataSrc )( json ) :
		json;
}
