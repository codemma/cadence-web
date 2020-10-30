import { findIndex, min, max } from 'lodash-es';
import { getEventConnections } from './get-event-connections';

class Graph {
  constructor(events = []) {
    this.setEvents(events);
  }

  setEvents(events) {
    this.events = events;
    this.sliceIndices = null;
  }

  /**
   * Build a graph around the `node`
   */
  selectNode(selectedEventId = null) {
    const N = 100;
    // If the selected node index is within (S * 100)% of the middle of rendered slice,
    // we do not need to redraw the graph, just scroll to the node.
    const S = 0.6;
    const eventIds = {};
    const nodes = [];
    const edges = [];
    const results = {
      shouldRedraw: false,
      previousExecutionRoute: null,
      parentWorkflowExecution: null,
      elements: [],
    };

    const { events: allEvents, sliceIndices } = this;

    if (!allEvents || !allEvents.length) {
      return results;
    }

    const index = findIndex(
      allEvents,
      ({ eventId }) => String(eventId) === selectedEventId
    );

    if (sliceIndices) {
      // No need to redraw if selected node is in the middle of rendered slice
      const { from, to } = sliceIndices;
      const center = (to + from) / 2;
      const delta = N * 0.5 * S;
      const threshold = {
        from: from === 0 ? 0 : Math.floor(center - delta),
        to:
          to >= allEvents.length - 1
            ? allEvents.length
            : Math.floor(center + delta),
      };

      if (index >= 0 && index >= threshold.from && index <= threshold.to) {
        return results;
      }
    }

    results.shouldRedraw = true;

    const from = Math.floor(Math.max(0, index - N / 2));
    const to = Math.min(allEvents.length, from + N);
    const events = allEvents.slice(from, to);

    this.sliceIndices = { from, to };
    const parentArray = [];

    const setDirectAndInferred = node => {
      const nodeId = node.eventId,
        { parent, inferredChild } = getEventConnections(node, allEvents);

      if (parent && eventIds[parent] && eventIds[nodeId]) {
        parentArray.push(parent);
        edges.push({
          group: 'edges',
          data: { source: parent, target: nodeId, type: 'direct' },
        });
      }

      if (inferredChild && eventIds[inferredChild]) {
        parentArray.push(nodeId);
        edges.push({
          group: 'edges',
          data: { source: nodeId, target: inferredChild, type: 'inferred' },
        });
      }
    };

    const setChron = node => {
      const nodeId = node.eventId,
        { chronologicalChild } = getEventConnections(node, allEvents);

      if (chronologicalChild && eventIds[chronologicalChild]) {
        edges.push({
          group: 'edges',
          data: {
            source: nodeId,
            target: chronologicalChild,
            type: 'chronological',
          },
        });
      }
    };

    events.forEach(event => {
      eventIds[event.eventId] = true;
      const {
        parentWorkflowExecution,
        previousExecutionRunId,
        newExecutionRunId,
        status,
        childRoute,
      } = getEventConnections(event, events);

      if (previousExecutionRunId) {
        results.previousExecutionRunId = previousExecutionRunId;
      } else if (parentWorkflowExecution) {
        results.parentWorkflowExecution = parentWorkflowExecution;
      }

      nodes.push({
        group: 'nodes',
        data: {
          id: event.eventId,
          name: event.eventType,
          childRoute: childRoute,
          newExecutionRunId: newExecutionRunId,
          status: status,
          timestamp: event.timestamp.valueOf(),
        },
      });
    });

    //Set the direct and inferred relationships
    events.forEach(node => {
      setDirectAndInferred(node);
    });

    //Set the chronological relationships.
    //If the node is not referred to as a parent it should be connected back to the graph with a chron child
    events.forEach(node => {
      if (!parentArray.includes(node.eventId)) {
        setChron(node);
      }
    });

    // Arrange graph
    const arrangeGraph = ({ nodes, edges }) => {
      const idToNode = {};
      const idToChildren = {};
      // const timestampIndices = {};
      const hasParent = {};
      const rootNodes = [];

      nodes.forEach((n, index) => {
        idToNode[n.data.id] = n;
        idToChildren[n.data.id] = [];

        n.data.timestampIndex = index;
        // if (timestampIndices[n.data.timestamp] === undefined) {
        //   timestampIndices[n.data.timestamp] = Object.keys(
        //     timestampIndices
        //   ).length;
        // }
      });

      for (const e of edges) {
        idToChildren[e.data.source].push(idToNode[e.data.target]);
        hasParent[e.data.target] = true;
      }

      for (const n of nodes) {
        if (!hasParent[n.data.id]) {
          rootNodes.push(n);
        }
      }

      const LEVEL_STEP = 15;
      const TIME_STEP = 50;

      const arrange = (nodes, level, timestamp) => {
        let currentLevel = level;

        nodes.forEach((n, i) => {
          n.position = {
            x: currentLevel * LEVEL_STEP,
            y: n.data.timestampIndex * TIME_STEP,
          };

          if (idToChildren[n.data.id].length) {
            const { level: newLevel } = arrange(
              idToChildren[n.data.id],
              currentLevel
            );

            currentLevel = newLevel + 1;
          }
        });

        return {
          level: currentLevel,
          timestamps: [],
        };
      };

      arrange(rootNodes, 0, 0);

      return { nodes, edges };
    };

    arrangeGraph({ nodes, edges });

    results.elements = [...nodes, ...edges];

    return results;
  }
}

export default Graph;
