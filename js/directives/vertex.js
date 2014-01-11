define( [
   'underscore',
   'jquery',
   'jquery.ui',
   'angular',
   '../utilities/layout',
   '../utilities/async'
],
function( _, $, jqueryUi, ng, layout, async, undefined ) {
   'use strict';

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   function createVertexDirective( $timeout ) {
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
               drag: async.repeatAfter( handleVertexDrag, $timeout ),
               stop: handleVertexDragStop
            } );

            var linkControllers = [];

            var jqVertex = $( $element[ 0 ] );
            var jqGraph = $( $element[ 0 ].parentNode );

            //////////////////////////////////////////////////////////////////////////////////////////////////

            this.calculateBox = calculateBox;

            $scope.nbeVertex = this;

            //////////////////////////////////////////////////////////////////////////////////////////////////

            function handleVertexDragStart( event, ui ) {
               linkControllers = graphController.vertexLinkControllers( id );
            }

            //////////////////////////////////////////////////////////////////////////////////////////////////

            function handleVertexDrag( event, ui ) {
               ng.forEach( linkControllers, function( linkController ) {
                  linkController.updatePath();
               } );
            }

            //////////////////////////////////////////////////////////////////////////////////////////////////

            function handleVertexDragStop() {
               linkControllers = [];
            }

            //////////////////////////////////////////////////////////////////////////////////////////////////

            function calculateBox( box ) {
               layout.boundingBox( jqVertex, jqGraph, box );
            }

            //////////////////////////////////////////////////////////////////////////////////////////////////

         }
      };
   }

   ///////////////////////////////////////////////////////////////////////////////////////////////////////////

   return {
      define: function( module ) {
         module.directive( 'nbeVertex', [ '$timeout', createVertexDirective ] );
      }
   }


} );