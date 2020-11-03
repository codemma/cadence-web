import { findIndex, orderBy } from 'lodash-es';
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
    const N = 300;
    const enableChronologicalEdges = false;

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

    // Set the direct and inferred relationships
    events.forEach(node => {
      setDirectAndInferred(node);
    });

    // Set the chronological relationships.
    // If the node is not referred to as a parent it should be connected back to the graph with a chron child
    if (enableChronologicalEdges) {
      events.forEach(node => {
        if (!parentArray.includes(node.eventId)) {
          setChron(node);
        }
      });
    }

    // Arrange graph
    const arrangeGraph = ({ nodes, edges }) => {
      const idToNode = {};
      const idToChildren = {};
      const timeIndices = {};
      const hasParent = {};
      const rootNodes = [];

      // Iterate through nodes and set `timeIndex` and `timeIndexSecondary` for every node
      // timeIndex is an index of the node timestamp in a sorted array of all timestamps
      // Which is used to keep the chronogical order of nodes but discard the scale of time intervals
      // when drawing the graph
      nodes.forEach((n, index) => {
        idToNode[n.data.id] = n;
        idToChildren[n.data.id] = [];

        if (timeIndices[n.data.timestamp] === undefined) {
          const index = Object.keys(timeIndices).length;

          timeIndices[n.data.timestamp] = index;
        }

        n.data.timeIndex = timeIndices[n.data.timestamp];
        n.data.timeIndexSecondary = 0;
      });

      // Find all roots (entry points with no parents) of the graph
      for (const e of edges) {
        idToChildren[e.data.source].push(idToNode[e.data.target]);
        hasParent[e.data.target] = true;
      }

      for (const n of nodes) {
        if (!hasParent[n.data.id]) {
          rootNodes.push(n);
        }
      }

      // Traverse the graph recursively and set `level` and `timeIndexSecondary` for all nodes
      // Level is horizontal offset of the tree-like graph node arranged to avoid overlapping.
      // `timeIndexSecondary` is secondary time coordinate:
      //    there are two connected nodes: A -----> B
      //    A.data.timeIndex === B.data.timeIndex
      //  then we set
      //    A.data.timeIndexSecondary = 0
      //    B.data.timeIndexSecondary = 1
      //  To display B node beflow the A node whilst they they have the same timestamp
      const arrange = (
        nodes,
        level = 0,
        parentTimeIndex = -1,
        parentTimeIndexOffset = 0
      ) => {
        let l = level;

        nodes.forEach((n, i) => {
          if (i) {
            ++l;
          }

          const children = idToChildren[n.data.id];

          if (n.data.level === undefined) {
            n.data.level = l;
            n.data.timeIndexSecondary =
              parentTimeIndex === n.data.timeIndex
                ? parentTimeIndexOffset + 1
                : 0;

            if (children.length) {
              const { level: newLevel } = arrange(
                children,
                l,
                n.data.timeIndex,
                n.data.timeIndexSecondary
              );

              l = newLevel;
            }
          }
        });

        return {
          level: l,
        };
      };

      // Arrange all nodes in the graph, starting from root entry points
      arrange(rootNodes);

      // Constants define the spacing of nodes in the graph
      const LEVEL_STEP = 200; // Horizontal `x` offset between same level nodes
      const TIME_STEP = 90; // Offset between primary chronological layers
      const TIME_SHIFT = 55; // Offset between primary and secondary chronological layers (having the same timestamps)

      // Calculate `tTimes` for all (timeIndex, timeIndexSecondary) pairs
      // which are the time (Y) coordinates nodes in the graph
      let t = 0;
      let prevT1 = 0;
      let prevT2 = 0;
      const tTimes = {};
      const times = orderBy(
        nodes.map(n => ({
          t1: n.data.timeIndex,
          t2: n.data.timeIndexSecondary,
        })),
        ['t1', 't2']
      );
      const makeKey = (primary, secondary) => `${primary}-${secondary}`;

      times.forEach(({ t1, t2 }) => {
        const key = makeKey(t1, t2);

        if (t1 === prevT1) {
          t += (t2 - prevT2) * TIME_SHIFT;
        }

        t += (t1 - prevT1) * TIME_STEP;
        prevT1 = t1;
        prevT2 = t2;

        tTimes[key] = t;
      });

      // Set the `position` for all nodes using the calculated `level` and `tTimes` values
      nodes.forEach(n => {
        const key = makeKey(n.data.timeIndex, n.data.timeIndexSecondary);

        n.position = {
          x: n.data.level * LEVEL_STEP,
          y: tTimes[key],
        };
      });

      return { nodes, edges };
    };

    arrangeGraph({ nodes, edges });

    results.elements = [...nodes, ...edges];

    return results;
  }
}

export default Graph;
