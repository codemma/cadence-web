import { findIndex } from 'lodash-es';
import { getEventConnections } from './get-event-connections';

/**
 * Build a graph around the `node`
 */
export const buildTree = (allEvents, selectedEventId = null) => {
  const N = 100;
  const eventIds = {};
  const nodes = [];
  const edges = [];

  if (!allEvents.length) {
    return [];
  }

  const index = findIndex(
    allEvents,
    ({ eventId }) => String(eventId) === selectedEventId
  );
  const from = Math.floor(Math.max(0, index - N / 2));
  const to = Math.min(allEvents.length, from + N);
  const events = allEvents.slice(from, to);
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

    //We are viewing a child workflow, show parent btn
    // if (previousExecutionRunId) {
    //   store.commit("previousExecutionRoute", previousExecutionRunId);
    // } else if (parentWorkflowExecution) {
    //   store.commit("parentRoute", parentWorkflowExecution);
    // }

    nodes.push({
      group: 'nodes',
      data: {
        id: event.eventId,
        name: event.eventType,
        childRoute: childRoute,
        newExecutionRunId: newExecutionRunId,
        status: status,
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
      // setChron(node);
    }
  });

  return [...nodes, ...edges];
};
