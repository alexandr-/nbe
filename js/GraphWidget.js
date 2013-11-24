define( [
   'underscore',
   'jquery',
   'jquery.ui',
   'angular',
   'pathing',
   'dummy_data'
],
function ( _, $, jqueryUi, ng, svgLinkPath, data, undefined ) {
   "use strict";

   // :TODO: calculate from stylesheet
   var EDGE_OFFSET = 15;
   var PORT_OFFSET = 8;

   var module = ng.module( 'GraphWidget', [ ] );


   //////////////////////////////////////////////////////////////////////////////////////////////////////////

   function calculateBoundingBox( jqNode, jqGraph, box ) {
      var v = jqNode.offset();
      var graphOffset = jqGraph.offset();
      var top = v.top - graphOffset.top;
      var left = v.left - graphOffset.left;
      box.top = top;
      box.left = left;
      box.right = left + jqNode.width();
      box.bottom = top + jqNode.height();
   }

   //////////////////////////////////////////////////////////////////////////////////////////////////////////

   function GraphWidget( $scope ) {
      var model = $scope.model = data.get( 'dummyModel' );
      var layout = $scope.layout = data.get( 'dummyLayout' );
         var view = $scope.view = { links: { } };
   }

   GraphWidget.$inject = [ '$scope' ];

   module.controller( 'GraphWidget', GraphWidget );

   //////////////////////////////////////////////////////////////////////////////////////////////////////////

   /**
    * The Graph directive controller manages the view-model for the underlying graph.
    * It is mainly concerned with creating and maintaining links and their controllers.
    * Links are visible connections that represent graph multi-edge membership.
    * Each link has one end at a vertex node's port (input or output) and one end at an edge node.
    */
   module.directive( 'nbeGraph', function createGraphDirective() {

      return {
         restrict: 'A',
         controller: function VertexController( $scope, $element ) {
            var links = $scope.view.links = { };

            var linksByEdge = { };
            var linksByVertex = { };

            // console.log( 'links by edge:', linksByEdge );

            this.jqGraph = $( $element[ 0 ] );

            // When ghost links are dropped, the drop target can be accessed here.
            this.dropInfo = { node: null, port: null };

            // nbeLink directives register themselves here
            var linkControllers = this.linkControllers = { };

            var nextLinkId = 0;
            function createLink( sourceNode, sourcePort, destNode, destPort, type ) {
               var link = {
                  id: nextLinkId++,
                  type: type,
                  source: { node: sourceNode, port: sourcePort },
                  dest: { node: destNode, port: destPort }
               };
               function add( map, outerKey, innerKey, value ) {
                  if ( map[ outerKey ] === undefined ) map[ outerKey ] = { };
                  map[ outerKey ][ innerKey ] = value;
               }
               add( sourcePort ? linksByVertex : linksByEdge, sourceNode, link.id, link );
               add( destPort   ? linksByVertex : linksByEdge, destNode,   link.id, link );
               // console.log( 'link', link.id, 'created. linksByVertex:', linksByVertex );
               links[ link.id ] = link;
            };
            this.createLink = createLink;

            function deleteLink( link ) {
               function remove( map, outerKey, innerKey ) {
                  delete map[ outerKey ][ innerKey ];
               }
               remove( link.source.port ? linksByVertex : linksByEdge, link.source.node, link.id );
               remove( link.dest.port   ? linksByVertex : linksByEdge, link.dest.node,   link.id );
               $scope.$apply( function() {
                  delete $scope.view.links[ link.id ];
               } );
            };
            this.deleteLink = deleteLink;

            function connectFromEdge( vertexId, portId, port, edgeId ) {
               $scope.$apply( function() {
                  port.edge = edgeId;
                  createLink( edgeId, null, vertexId, portId, port.type );
               } );
            };
            this.connectFromEdge = connectFromEdge;

            function connectToEdge( vertexId, portId, port, edgeId ) {
               $scope.$apply( function() {
                  port.edge = edgeId;
                  createLink( vertexId, portId, edgeId, null, port.type );
               } );
            };
            this.connectToEdge = connectToEdge;


            function disconnect( vertexId, portId, port ) {
               // delete any existing link from this port
               if ( !port.edge ) return;
               var link = linkByPort( vertexId, portId );
               deleteLink( link );
               $scope.$apply( function() {
                  delete port.edge;
               } );
            };
            this.disconnect = disconnect;

            this.vertexLinkControllers = function vertexLinkControllers( vertexId ) {
               if ( linksByVertex[ vertexId ] === undefined ) return [ ];
               return _.map( linksByVertex[ vertexId ], function( link, linkId ) {
                  return linkControllers[ linkId ];
               } );
            };

            this.edgeLinkControllers = function edgeLinkControllers( edgeId ) {
               if ( linksByEdge[ edgeId ] === undefined ) return [ ];
               return _.map( linksByEdge[ edgeId ], function( link, linkId ) {
                  return linkControllers[ linkId ];
               } );
            };

            var linkByPort = this.linkByPort = function linkByPort( vertexId, portId ) {
               var links = linksByVertex[ vertexId ];
               for ( var linkId in links ) {
                  var link = links[ linkId ];
                  if ( link.source.port === portId || link.dest.port === portId ) {
                     return links[ linkId ];
                  }
               }
            };

            ng.forEach( $scope.model.vertices, function( vertex, vertexId ) {
               ng.forEach( vertex.ports.in, function( port, portId ) {
                  if ( port.edge )
                     createLink( port.edge, null, vertexId, portId, port.type );
               } );
               ng.forEach( vertex.ports.out, function( port, portId ) {
                  if ( port.edge )
                     createLink( vertexId, portId, port.edge, null, port.type );
               } );
            } );

            $scope.nbeGraph = this;
         }
      };

   } );

   //////////////////////////////////////////////////////////////////////////////////////////////////////////

   module.directive( 'nbeEdge', function createVertexDirective() {
      return {
         restrict: 'A',
         controller: function EdgeController( $scope, $element ) {

            var graph = $scope.nbeGraph;
            var edgeId = $scope.edgeId;

            $( $element[ 0 ] ).draggable( {
               stack: '.graph *',
               containment: 'parent',
               start: handleEdgeDragStart,
               drag: handleEdgeDrag,
               stop: handleEdgeDrop
            } );

            var linkControllers = [];
            function handleEdgeDragStart( event, ui ) {
               linkControllers = graph.edgeLinkControllers( edgeId );
            }

            function handleEdgeDrag( event, ui ) {
               ng.forEach( linkControllers, function( linkController ) {
                  linkController.updatePath();
               } );
            }

            function handleEdgeStop() {
               linkControllers = [];
            }

            $( $element[ 0 ] ).droppable( {
               accept: 'i',
               hoverClass: 'drop-hover',
               drop: handleEdgeDrop
            } );

            function handleEdgeDrop() {
               graph.dropInfo.node = edgeId;
               graph.dropInfo.port = null;
            }

            $scope.nbeEdge = this;
            this.jqEdge = $( $element[ 0 ] );
            this.jqGraph = $( $element[ 0 ].parentNode );
         }
      };
   } );

   //////////////////////////////////////////////////////////////////////////////////////////////////////////

   module.directive( 'nbeVertex', function createVertexDirective() {
      return {
         restrict: 'A',
         controller: function VertexController( $scope, $element ) {

            var graphController = $scope.nbeGraph;
            var vertex = $scope.vertex;
            var id = $scope.vertexId;

            $( $element[ 0 ] ).draggable( {
               stack: '.graph *',
               containment: 'parent',
               start: handleVertexDragStart,
               drag: handleVertexDrag,
               stop: handleVertexDragStop
            } );

            var linkControllers = [];
            function handleVertexDragStart( event, ui ) {
               linkControllers = graphController.vertexLinkControllers( id );
               // console.log( linkControllers );
            }

            function handleVertexDrag( event, ui ) {
               ng.forEach( linkControllers, function( linkController ) {
                  linkController.updatePath();
               } );
            }

            function handleVertexDragStop() {
               linkControllers = [];
            }

            var jqVertex = $( $element[ 0 ] );
            var jqGraph = $( $element[ 0 ].parentNode );

            function calculateBox( box ) {
               calculateBoundingBox( jqVertex, jqGraph, box );
            }
            this.calculateBox = calculateBox;

            $scope.nbeVertex = this;

         }
      };
   } );

   //////////////////////////////////////////////////////////////////////////////////////////////////////////

   module.directive( 'nbePort', function createPortDirective() {

      var PORT_CLASS_IN = 'in', PORT_CLASS_OUT = 'out';

      var round = Math.round;

      return {
         restrict: 'A',
         controller: function PortController( $scope, $element, $attrs ) {

            var graph = $scope.nbeGraph;
            var portGroup = $attrs[ 'nbePortGroup' ];
            var stubType = portGroup === PORT_CLASS_OUT ? 1 : -1;
            var connect = portGroup === PORT_CLASS_OUT ? graph.connectToEdge : graph.connectFromEdge;

            var vertexId = $scope.vertexId;
            var portId = $scope.portId;
            var portType = $scope.port.type || '';
            // console.log( $scope.port.label, $( 'i', $element[0] )[0], $scope.port.type );

            var jqGraph = graph.jqGraph;
            var jqPortGhost = $( '.port.GHOST', jqGraph );
            var jqLinkGhost= $( '.link.GHOST', jqGraph );

            // Drag starting position, relative to graph canvas.
            var fromLeft,
                fromTop,
                fromBox = { top: 0, bottom: 0, left: 0, right: 0 };
            var graphOffset;

            $( 'i', $element[0] ).draggable( {
               opacity: 0.8,
               helper: function() {
                  return $( '.GHOST.port', jqGraph ).clone().show();
               },
               zIndex: 1000,
               start: handlePortDragStart,
               drag: handlePortDrag,
               stop: handlePortDragStop,
               addClasses: false,
               appendTo: jqGraph
            } );

            // , cursorAt: { left: 8, top: 8 }

            var basicLinkClass = jqLinkGhost.attr( "class" ) + " ";

            function handlePortDragStart( event, ui ) {
               var jqHandle = $( event.target );

               graph.disconnect( $scope.vertexId, $scope.portId, $scope.port );
               graph.dragNodeId = $scope.vertexId;
               graph.dragPortId = $scope.portId;

               var p = jqHandle.offset();
               graphOffset = jqGraph.offset();

               fromLeft = p.left - graphOffset.left + PORT_OFFSET;
               fromTop = p.top - graphOffset.top + PORT_OFFSET;
               $scope.nbeVertex.calculateBox( fromBox );

               ui.helper.addClass( portType ).show();
               jqLinkGhost.attr( "class", basicLinkClass + portType ).show();
            }

            function handlePortDrag( event, ui ) {
               var pos = ui.offset;
               var toLeft = pos.left - graphOffset.left + PORT_OFFSET;
               var toTop = pos.top - graphOffset.top + PORT_OFFSET;
               jqLinkGhost.attr( "d", svgLinkPath( fromLeft, fromTop, toLeft, toTop, stubType, 0, fromBox, null ) );
            }

            function handlePortDragStop() {
               // console.log( 'port ', portId, 'drop to', graph.dropInfo );
               jqPortGhost.removeClass( portType );
               jqLinkGhost.attr( "class", basicLinkClass ).hide();
               if ( graph.dropInfo.node ) {
                  // check if types match...
                  connect( vertexId, portId, $scope.port, graph.dropInfo.node, graph.dropInfo.port );
                  graph.dropInfo.node = graph.dropInfo.port = null;
               }
            }

         }
      };

   } );

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   module.directive( 'nbeLink', [ '$timeout', function createLinkDirective( $timeout ) {

      return {
         restrict: 'A',
         controller: function LinkController( $scope, $element ) {

            // ngClass does not work with SVG
            var basicLinkClass = $element.attr( "class" );
            $element.attr( "class", basicLinkClass + " " + $scope.link.type );

            var graph = $scope.nbeGraph;
            graph.linkControllers[ $scope.link.id ] = this;
            var jqGraph = graph.jqGraph;
            var graphOffset = jqGraph.offset();

            var source = $scope.link.source;
            var dest = $scope.link.dest;

            var jqSourceNode, jqSourceHandle;
            var jqDestNode, jqDestHandle;

            var from = [ 0, 0 ];
            var fromBox = { top: 0, bottom: 0, left: 0, right: 0 };
            var to = [ 0, 0 ];
            var toBox = { top: 0, bottom: 0, left: 0, right: 0 };

            function jqVertexPlusHandle( portInfo ) {
               // console.log( 'Looking for node', portInfo.node );
               var jqNode = $( '[data-nbe-vertex="' + portInfo.node + '"]', jqGraph );
               var jqHandle = $( '[data-nbe-port="' + portInfo.port + '"] i', jqNode );
               // console.log( 'Node: ', jqSourceNode.get(0) );
               // console.log( 'Port: ', jqSourcePort.get(0) );
               return [ jqNode, jqHandle ];
            }

            function jqEdge( portInfo ) {
               return $( '[data-nbe-edge="' + portInfo.node + '"]', jqGraph );
            }

            function calculateLinkEnd( jqNode, jqHandle, coords ) {
               if ( jqHandle ) {
                  var p = jqHandle.offset();
                  coords[ 0 ] = p.left - graphOffset.left + PORT_OFFSET;
                  coords[ 1 ] = p.top - graphOffset.top + PORT_OFFSET;
               }
               else {
                  var n = jqNode.offset();
                  coords[ 0 ] = n.left - graphOffset.left + EDGE_OFFSET;
                  coords[ 1 ] = n.top - graphOffset.left + EDGE_OFFSET;
               }
               // console.log( 'Center(%o, %o): ', jqNode.data( 'nbeVertex' ) || jqNode.data( 'nbeEdge' ), jqHandle && jqHandle.data( 'nbePort' ), coords );
               return calculateLinkEnd;
            }

            function updatePath() {
               calculateLinkEnd( jqSourceNode, jqSourceHandle, from );
               calculateLinkEnd( jqDestNode, jqDestHandle, to );
               calculateBoundingBox( jqSourceNode, jqGraph, fromBox );
               calculateBoundingBox( jqDestNode, jqGraph, toBox );
               $element.attr( 'd', svgLinkPath( from[ 0 ], from[ 1 ], to[ 0 ], to[ 1 ], 1, -1, fromBox, toBox ) );
            }
            this.updatePath = updatePath;

            function init() {
               // console.log( 'link controller: ', $scope.link );
               // console.log( 'init SP: ', source.port, ' DP: ', dest.port );

               if ( source.port ) {
                  var jqSourceInfo = jqVertexPlusHandle( source );
                  jqSourceNode = jqSourceInfo[0];
                  jqSourceHandle = jqSourceInfo[1];
               }
               else {
                  jqSourceNode = jqEdge( source );
                  jqSourceHandle = null;
               }

               if ( dest.port ) {
                  var jqDestInfo = jqVertexPlusHandle( dest );
                  jqDestNode = jqDestInfo[0];
                  jqDestHandle = jqDestInfo[1];
               }
               else {
                  jqDestNode = jqEdge( dest );
                  jqDestHandle = null;
               }

               // console.log( "SN: ", jqSourceNode.get(0).tagName, jqSourceHandle && jqSourceHandle.get(0) );
               // console.log( "DN: ", jqDestNode.get(0).tagName, jqDestHandle && jqDestHandle.get(0) );
               updatePath();
            }

            $timeout( init, 1 );
         }
      }
   } ] );

   //////////////////////////////////////////////////////////////////////////////////////////////////////////

   return module;

} );
