<template>
  <div id="cytoscape">
    <div ref="cy" id="cy"></div>
  </div>
</template>

<script>
import dagre from 'cytoscape-dagre';
import cytoscape from 'cytoscape';
import omit from 'lodash-es/omit';
import { buildTree } from '../helpers/graph';
import graphStyles from '../helpers/graph-styles';
import store from '../../../store/index';

cytoscape.use(dagre);

export default {
  name: 'cytoscape-graph',
  props: ['events'],
  data() {
    return {
      nodes: [],
      edges: [],
      styles: graphStyles,
    };
  },
  watch: {
    selectedEvent(id) {
      this.selectNode(id);
    },
  },
  methods: {
    zoomToNode(node) {
      const zoom = 1.1,
        bb = node.boundingBox(),
        w = this.cy.width(),
        h = this.cy.height(),
        pan = {
          x: (w - zoom * (bb.x1 + bb.x2)) / 2,
          y: (h - zoom * (bb.y1 + bb.y2)) / 2,
        };

      //Pan the graph to view node
      this.cy.animate({
        zoom: 1.1,
        pan: pan,
      });
    },
    updateChildBtn(node) {
      const nodeData = node.data();

      if (nodeData.childRoute) {
        store.commit('childRoute', {
          route: nodeData.childRoute,
          btnText: 'To child',
        });
      } else if (nodeData.newExecutionRunId) {
        store.commit('childRoute', {
          route: nodeData.newExecutionRunId,
          btnText: 'Next execution',
        });
      } else {
        store.commit('toggleChildBtn');
      }
    },
    selectNode(id) {
      // Update graph to render nodes around the select one
      this.updateView(id);

      // Deselect all previously selected nodes
      this.cy.$(':selected').deselect();

      // Mark current node as selected
      const node = id !== null ? this.cy.elements('node#' + id) : null;

      if (!node || !node.length) {
        // Display whole graph
        this.cy.fit();
      } else {
        // Zoom to the selected node
        node.select();
        this.updateChildBtn(node);
        this.zoomToNode(node);
      }
    },
    updateView(id = null) {
      const elements = buildTree(this.events, id);

      if (this.cy) {
        this.cy.unmount();
        this.cy.destroy();
        this.cy = null;
      }

      // Create cy instance
      const container = this.$refs.cy;
      const cy = cytoscape({
        autoungrabify: true,
        styleEnabled: true,
        container: container,
        headless: true,
        hideEdgesOnViewport: true,
        //Uncomment the two lines below for better performance
        //textureOnViewport: true,
        //pixelRatio: 1,
        style: graphStyles,
        elements,
        layout: {
          name: 'dagre',
          nodeDimensionsIncludeLabels: true,
          spacingFactor: 1.2, // to avoid node collision
          nodeSep: 230,
          edgeSep: 100,
          rankSep: 70,
        },
      });

      cy.minZoom(0.2);
      cy.maxZoom(10);

      cy.on('mouseover', 'node', function(e) {
        container.style.cursor = 'pointer';
      });
      cy.on('mouseout', 'node', function(e) {
        container.style.cursor = 'default';
      });

      const self = this;

      //Register click event
      cy.on('tap', function(evt) {
        const evtTarget = evt.target;

        //Tap on background
        if (evtTarget === cy) {
          if (self.$route.query.eventId) {
            self.$router.replace({
              query: omit(self.$route.query, 'eventId'),
            });
            store.commit('toggleChildBtn');
          }
          //Tap on a node that is not already selected
        } else if (evtTarget.isNode() && !evtTarget.selected()) {
          const nodeData = evtTarget.data();

          self.$router.replace({
            query: { ...self.$route.query, eventId: nodeData.id },
          });
        }
      });
      cy.mount(container);
      this.cy = cy;
    },
  },
  computed: {
    selectedEvent() {
      return this.$route.query.eventId;
    },
  },
  mounted() {
    this.selectNode(this.$route.query.eventId);
  },
};
</script>
<style scoped>
#cytoscape {
  width: 100%;
  height: 100%;
}
#cy {
  width: 100%;
  height: 100%;
}
</style>
