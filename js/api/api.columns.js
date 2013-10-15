

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * Columns
 *
 * {integer}           - column index
 * "{integer}"         - column index
 * "{integer}:visIdx"  - visible column index (i.e. translate to column index)
 * "{integer}:visible" - alias for {integer}:visIdx
 * "{string}"          - column name
 * "{string}:jq"       - jQuery selector on column header nodes
 *
 */

// can be an array of these items, comma separated list, or an array of comma
// separated lists

var __re_column_selector = /^(.*):(jq|visIdx|visible)$/;

var __column_selector = function ( settings, selector, opts )
{
	var
		columns = settings.aoColumns,
		names = _pluck( columns, 'sName' ),
		nodes = _pluck( columns, 'nTh' );

	return _selector_run( selector, function ( s ) {
		var selInt = _intVal( s );

		if ( s === '' ) {
			// All columns
			return _range( settings.aoColumns.length );
		}
		else if ( selInt !== null ) {
			// Integer selector
			return [ selInt ];
		}
		else {
			var match = s.match( __re_column_selector );

			if ( match ) {
				switch( match[2] ) {
					case 'visIdx':
					case 'visible':
						// Visible index given, convert to column index
						return [ _fnVisibleToColumnIndex( settings, parseInt( match[1], 10 ) ) ];

					case 'jq':
						// jQuery selector on the TH elements for the columns
						return $( nodes )
							.filter( match[1] )
							.map( function () {
								return $.inArray( this, nodes ); // `nodes` is column index complete and in order
							} )
							.toArray();
				}
			}
			else {
				// match by name. `names` is column index complete and in order
				return $.map( names, function (name, i) {
					return name === s ? i : null;
				} );
			}
		}
	} );
};





var __setColumnVis = function ( settings, column, vis ) {
	var
		cols = settings.aoColumns,
		col  = cols[ column ],
		data = settings.aoData,
		row, cells, i, ien, tr;

	// Get
	if ( vis === undefined ) {
		return col.bVisible;
	}

	// Set
	// No change
	if ( col.bVisible === vis ) {
		return;
	}

	if ( vis ) {
		// Insert column
		// Need to decide if we should use appendChild or insertBefore
		var insertBefore = $.inArray( true, _pluck(cols, 'bVisible'), column+1 );

		for ( i=0, ien=data.length ; i<ien ; i++ ) {
			tr = data[i].nTr;
			cells = data[i].anCells;

			if ( tr ) {
				// insertBefore can act like appendChild if 2nd arg is null
				tr.insertBefore( cells[ column ], cells[ insertBefore ] || null );
			}
		}
	}
	else {
		// Remove column
		$( _pluck( settings.aoData, 'anCells', column ) ).remove();

		col.bVisible = false;
		_fnDrawHead( settings, settings.aoHeader );
		_fnDrawHead( settings, settings.aoFooter );

		_fnSaveState( settings );
	}

	// Common actions
	col.bVisible = vis;
	_fnDrawHead( settings, settings.aoHeader );
	_fnDrawHead( settings, settings.aoFooter );

	// Automatically adjust column sizing
	_fnAdjustColumnSizing( settings );

	// Realign columns for scrolling
	if ( settings.oScroll.sX || settings.oScroll.sY ) {
		_fnScrollDraw( settings );
	}

	_fnCallbackFire( settings, null, 'column-visibility', [settings, column, vis] );

	_fnSaveState( settings );
};


/**
 *
 */
_api_register( 'columns()', function ( selector, opts ) {
	// argument shifting
	if ( selector === undefined ) {
		selector = '';
	}
	else if ( $.isPlainObject( selector ) ) {
		opts = selector;
		selector = '';
	}

	opts = _selector_opts( opts );

	var inst = this.iterator( 'table', function ( settings ) {
		return __column_selector( settings, selector, opts );
	} );

	// Want argument shifting here and in _row_selector?
	inst.selector.cols = selector;
	inst.selector.opts = opts;

	return inst;
} );


/**
 *
 */
_api_registerPlural( 'columns().header()', 'column().header()', function ( selector, opts ) {
	return this.iterator( 'column', function ( settings, column ) {
		return settings.aoColumns[column].nTh;
	} );
} );


/**
 *
 */
_api_registerPlural( 'columns().data()', 'column().data()', function () {
	return this.iterator( 'column-rows', function ( settings, column, i, j, rows ) {
		var a = [];
		for ( var row=0, ien=rows.length ; row<ien ; row++ ) {
			a.push( _fnGetCellData( settings, rows[row], column, '' ) );
		}
		return a;
	} );
} );


_api_registerPlural( 'columns().cache()', 'column().cache()', function ( type ) {
	return this.iterator( 'column-rows', function ( settings, column, i, j, rows ) {
		return _pluck_order( settings.aoData, rows,
			type === 'filter' ? '_aFilterData' : '_aSortData', column
		);
	} );
} );


_api_registerPlural( 'columns().nodes()', 'columns().nodes()', function () {
	return this.iterator( 'column-rows', function ( settings, column, i, j, rows ) {
		return _pluck_order( settings.aoData, rows, 'anCells', column ) ;
	} );
} );



_api_registerPlural( 'columns().visible()', 'column().visible()', function ( vis ) {
	return this.iterator( 'column', function ( settings, column ) {
		return __setColumnVis( settings, column, vis );
	} );
} );



_api_registerPlural( 'columns().index()', 'column().index()', function ( type ) {
	return this.iterator( 'column', function ( settings, column ) {
		return type === 'visible' ?
			_fnColumnIndexToVisible( settings, column ) :
			column;
	} );
} );


// _api_register( 'columns().show()', function () {
// 	var selector = this.selector;
// 	return this.columns( selector.cols, selector.opts ).visible( true );
// } );


// _api_register( 'columns().hide()', function () {
// 	var selector = this.selector;
// 	return this.columns( selector.cols, selector.opts ).visible( false );
// } );



_api_register( 'columns.adjust()', function () {
	return this.iterator( 'table', function ( settings ) {
		_fnAdjustColumnSizing( settings );
	} );
} );


// Convert from one column index type, to another type
_api_register( 'column.index()', function ( type, idx ) {
	if ( this.context.length !== 0 ) {
		var ctx = this.context[0];

		if ( type === 'fromVisible' || type === 'toIndex' ) {
			return _fnColumnIndexToVisible( ctx, idx );
		}
		else if ( type === 'fromIndex' || type === 'toVisible' ) {
			return _fnVisibleToColumnIndex( ctx, idx );
		}
	}
} );


_api_register( 'column()', function ( selector, opts ) {
	return _selector_first( this.columns( selector, opts ) );
} );
