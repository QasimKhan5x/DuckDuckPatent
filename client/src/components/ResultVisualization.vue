<template>
    <div :class="{ 'd3-container': true, updating: updating }">
        <!-- The d3 svg -->
        <svg xmlns="http://www.w3.org/2000/svg" @click="canvasClicked">
            <!-- the marker & pattern defs -->
            <defs>
                <marker
                    id="endarrow"
                    refX="14"
                    refY="2"
                    orient="auto"
                    markerWidth="8"
                    markerHeight="8"
                    overflow="visible"
                >
                    <!-- This design the type of arrow
                    d - define the design of arrow
                    -->
                    <path d="M0,0V 4L6,2Z" style="fill: black"></path>
                </marker>
                <pattern id="markOnce" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <image
                        xlink:href="../assets/singleTick.svg"
                        style="fill-opacity: 0.5"
                        stroke="black"
                        x="-4"
                        y="-4"
                    ></image>
                </pattern>
                <pattern id="markTwice" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <image
                        xlink:href="../assets/doubleTick.svg"
                        style="fill-opacity: 0.5"
                        stroke="black"
                        x="-6"
                        y="-4"
                    ></image>
                </pattern>
            </defs>
        </svg>
        <!-- Tooltip div -->
        <div class="tooltip card box-shadow no-select">{{ tooltipOnNodes }}</div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { Patent } from '@/models/Patent';
import {
    BaseType,
    D3DragEvent,
    D3ZoomEvent,
    drag,
    forceCenter,
    forceCollide,
    forceLink,
    forceManyBody,
    forceSimulation,
    forceX,
    forceY,
    select,
    Selection,
    Simulation,
    SimulationLinkDatum,
    SimulationNodeDatum,
    zoom,
} from 'd3';

import { VisualPatentNode } from '@/models/VisualPatentNode';
import { NodeInfo } from '@/models/NodeInfo';
import VisualizationHelperService from '@/services/visualization-helper.service';
import { VisualPatentLink } from '@/models/VisualPatentLink';
import { RelationMap } from '@/models/RelationMap';

type d3Event = { x: number; y: number; node: SimulationNodeDatum };
type d3ForceSim = Simulation<VisualPatentNode, SimulationLinkDatum<VisualPatentNode>>;
type d3Graph = { nodes: VisualPatentNode[]; links: SimulationLinkDatum<VisualPatentNode>[] };
type d3Selection = {
    graph: Selection<SVGGraphicsElement, unknown, HTMLElement, unknown>;
    svg: Selection<SVGElement, unknown, HTMLElement, unknown>;
    tooltip: Selection<HTMLElement, unknown, HTMLElement, unknown>;
};

/**
 * Component which is responsible for displaying a d3 force graph for the provided patents, applicants, inventors and citations
 */
export default defineComponent({
    name: 'ResultVisualization',
    props: {
        patents: {
            required: true,
            type: Array,
        },
        visualizationOptions: {
            required: true,
            type: Array,
        },
        updating: Boolean,
    },
    emits: {
        onNodeSelected: (e: { node: NodeInfo }) => e,
        onClearNodeSelected: null,
    },
    data() {
        return {
            currentMove: null as d3Event | null,
            currentNode: null as VisualPatentNode | null,
            container: null as Selection<BaseType, unknown, HTMLElement, unknown> | null,
            nodeSelected: false,
            documentWidth: document.documentElement.clientWidth,
            documentHeight: document.documentElement.clientHeight,
            graph: {
                nodes: [],
                links: [],
            } as d3Graph,
            resizeEvent: -1,
            simulation: null as d3ForceSim | null,

            width: 0,
            height: 0,
            selections: {} as d3Selection,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            zoom: null as any,
            forceProperties: VisualizationHelperService.getVisualizationOptions(),
            dragActive: false,
            selectedNode: null as VisualPatentNode | null,
        };
    },
    computed: {
        /**
         * Tooltip on patent, author and company nodes
         * When the results from DB is empty a tooltip with no data is displayed
         */
        tooltipOnNodes(): string | undefined {
            switch (this.currentNode?.type) {
                case 'patent':
                    return this.currentNode?.patent.title;
                case 'author':
                    return `AUT: ${this.currentNode?.id}`;
                case 'company':
                    return `CO.: ${this.currentNode?.id}`;
                case 'citation':
                    return `CITATION: ${this.currentNode?.id}`;
                case 'family':
                    return `FAMILY: ${this.currentNode?.id}`;
            }
            return 'No Data';
        },
        /**
         * Returns whether the save button is clicked from the state
         */
        onClickSave(): boolean {
            return this.$store.state.onClickSave;
        },
        /**
         * Gets the nodes
         */
        nodes(): VisualPatentNode[] {
            return this.graph.nodes;
        },
        /**
         * Gets the links
         */
        links(): SimulationLinkDatum<VisualPatentNode>[] {
            return this.graph.links;
        },
        /**
         * Gets the highlight node value from the store
         */
        highlightNode(): boolean {
            return this.$store.state.highlightNode;
        },
    },
    watch: {
        /**
         * Watches the patents value and updates the graph
         */
        patents(): void {
            this.updateData();
            this.updateGraph();
        },

        /**
         * Watches the visualization options.
         * Once they change the simulation needs to be updated
         */
        visualizationOptions() {
            this.updateData();
            this.updateGraph();
        },

        /**
         * Watches the dragActive value. If drag is active the tooltip needs to be hidden, otherwise it will be buggy
         * @param newVal
         */
        dragActive(newVal): void {
            if (!newVal) {
                this.selections.tooltip.style('visibility', 'visible');
                return;
            }

            this.selections.tooltip.style('visibility', 'hidden');
        },

        /**
         * Watches the highlightNode value. Call highlight once previewing node's card is true
         */
        highlightNode(newVal) {
            if (!newVal) {
                return;
            }

            this.highlightOnPreview(this.$store.state.patentID as string, this.$store.state.patentType as string);
            this.updateMarks();
        },
    },
    created() {
        // update the sent data
        this.updateData();

        // adding the event listener for the resize event here
        window.addEventListener('resize', this.onResize);

        // You can set the component width and height in any way
        // you prefer. It's responsive! :)
        this.width = window.innerWidth - 10;
        this.height = window.innerHeight - 110;

        this.simulation = forceSimulation<VisualPatentNode>()
            .force('link', forceLink())
            .force('charge', forceManyBody())
            .force('collide', forceCollide())
            .force('center', forceCenter())
            .force('forceX', forceX())
            .force('forceY', forceY())
            .on('tick', this.tick);

        this.updateForces();
    },
    mounted() {
        // setup and update the graph in the next rendering tick to make sure they already are rendered on the canvas
        this.$nextTick(() => {
            this.setupGraph();
            this.updateGraph();
        });
    },
    unmounted() {
        // unregistering the event listener for the resize event
        window.removeEventListener('resize', this.onResize);
    },
    methods: {
        /**
         * Sets up the svg graph components
         */
        setupGraph() {
            // Selecting the svg as the root for the d3 simulation
            this.container = select('.d3-container');
            this.selections.svg = select('svg');
            this.selections.tooltip = select('.tooltip');

            const svg = this.selections.svg;

            const selected = svg.append('svg:defs').selectAll('marker');
            selected
                .data(['small']) // small links for node size < 20
                .enter()
                .append('svg:marker') // This section adds in the arrows
                .attr('id', 'small')
                .attr('refX', 14) // Prevents arrowhead from being covered by circle
                .attr('refY', 2)
                .attr('markerWidth', 8)
                .attr('markerHeight', 8)
                .attr('orient', 'auto')
                .attr('overflow', 'visible')
                .append('svg:path')
                .attr('d', 'M0,0V 4L6,2Z')
                .attr('style', 'fill: black');
            selected
                .data(['middle']) //  links for node size > 15 & <20
                .enter()
                .append('svg:marker')
                .attr('id', 'middle')
                .attr('refX', 17)
                .attr('refY', 2)
                .attr('markerWidth', 8)
                .attr('markerHeight', 8)
                .attr('orient', 'auto')
                .attr('overflow', 'visible')
                .append('svg:path')
                .attr('d', 'M0,0V 4L6,2Z')
                .attr('style', 'fill: black');
            selected
                .data(['large']) // links for node size > 20
                .enter()
                .append('svg:marker')
                .attr('id', 'large')
                .attr('refX', 19)
                .attr('refY', 2)
                .attr('markerWidth', 8)
                .attr('markerHeight', 8)
                .attr('orient', 'auto')
                .attr('overflow', 'visible')
                .append('svg:path')
                .attr('d', 'M0,0V 4L6,2Z')
                .attr('style', 'fill: black');
            selected
                .data(['extralarge']) // links for node size > 40
                .enter()
                .append('svg:marker')
                .attr('id', 'extralarge')
                .attr('refX', 27)
                .attr('refY', 2)
                .attr('markerWidth', 8)
                .attr('markerHeight', 8)
                .attr('orient', 'auto')
                .attr('overflow', 'visible')
                .append('svg:path')
                .attr('d', 'M0,0V 4L6,2Z')
                .attr('style', 'fill: black');

            // Add zoom and panning triggers
            this.zoom = zoom<SVGSVGElement, unknown>()
                .scaleExtent([1 / 4, 4])
                .on('zoom', this.zoomed);
            svg.call(this.zoom);

            // append the g tag
            this.selections.graph = svg.append('g');
        },

        /**
         * Is called every frame the simulation is active
         */
        tick() {
            // If no data is passed to the Vue component, do nothing
            if (!this.patents) {
                return;
            }

            const link = (d: VisualPatentLink<VisualPatentNode>) => {
                return 'M' + d.source.x + ',' + d.source.y + ' L' + d.target.x + ',' + d.target.y;
            };

            const graph = this.selections.graph;
            graph.selectAll<SVGPathElement, VisualPatentLink<VisualPatentNode>>('path').attr('d', link);
            graph.selectAll<SVGCircleElement, VisualPatentNode>('circle').attr('transform', (d: VisualPatentNode) => {
                return 'translate(' + d.x + ',' + d.y + ')';
            });
            this.updateMarks();
        },

        /**
         * Updates the graph simulation
         */
        updateGraph(alpha = 0.6) {
            this.simulation?.nodes(this.nodes);
            this.simulation?.force('link', forceLink(this.links as SimulationLinkDatum<VisualPatentNode>[]));

            const graph = this.selections.graph;

            // Links should only exit if not needed anymore
            graph.selectAll('path').data(this.graph.links).exit().remove();
            graph
                .selectAll<SVGPathElement, VisualPatentLink<VisualPatentNode>>('path')
                .data(this.graph.links)
                .enter()
                .append('path')
                .attr('class', (d) => 'link ' + (d as VisualPatentLink<VisualPatentNode>).type);

            // Nodes should always be redrawn to avoid lines above them
            graph.selectAll('circle').remove();
            graph
                .selectAll<SVGSVGElement, VisualPatentNode>('circle')
                .data(this.graph.nodes)
                .enter()
                .append('circle')
                .attr('r', (d) => d.size)
                .attr('class', (d: VisualPatentNode) => d.type)
                .call(
                    drag<SVGCircleElement, VisualPatentNode>()
                        .on('start', this.dragStart)
                        .on('drag', this.dragged)
                        .on('end', this.drop),
                )
                .on('mouseover', this.mouseOver)
                .on('mouseout', this.mouseOut)
                .on('click', this.nodeClick)
                .on('mousemove', this.mouseMove);

            // Add 'marker-end' attribute to each path
            const svg = select('svg');
            svg.selectAll('g')
                .selectAll<SVGPathElement, VisualPatentLink<VisualPatentNode>>('path')
                .attr('marker-end', (d) => {
                    // Caption items doesn't have source and target
                    if (d.source && d.target && d.source.index === d.target.index) return 'url(#end-self)';
                    //arrow marker adjusted based on the target size
                    return VisualizationHelperService.getArrowMark(d);
                });

            //handle checkmarks and highlights no click
            this.highlightOnClick();
            if (this.selectedNode?.type === 'patent') this.setMarkOnClick();
            this.updateMarks();

            // Update caption every time data changes
            this.simulation?.alpha(alpha).restart();
        },

        /**
         * Updates the data for the simulation
         */
        updateData(): void {
            const patents = this.patents as Patent[];
            const citationMap = VisualizationHelperService.getCitationMap(patents);
            const familyMap = VisualizationHelperService.getFamilyMap(patents);

            let authorsMap = {} as RelationMap;
            if (this.visualizationOptions.includes('authors')) {
                authorsMap = VisualizationHelperService.getCreatorMap(patents, 'inventors');
            }

            let companyMap = {} as RelationMap;
            if (this.visualizationOptions.includes('companies')) {
                companyMap = VisualizationHelperService.getCreatorMap(patents, 'applicants');
            }

            const nextNodes = VisualizationHelperService.getNodes(
                patents,
                citationMap,
                familyMap,
                this.visualizationOptions as string[],
                this.selectedNode,
                authorsMap,
                companyMap,
            );
            const newNodes = nextNodes.filter((t) => !this.graph.nodes.some((k) => k.id === t.id));
            this.graph.nodes = this.graph.nodes.filter((t) => nextNodes.some((k) => k.id === t.id)).concat(newNodes);

            this.graph.links = VisualizationHelperService.getLinks(
                this.graph.nodes,
                citationMap,
                familyMap,
                authorsMap,
                companyMap,
            );
        },

        /**
         * Function which triggers the updateGraph function after a specific delay is hit
         */
        onResize(): void {
            if (this.resizeEvent > -1) {
                clearTimeout(this.resizeEvent);
            }

            this.documentHeight = document.documentElement.clientHeight;
            this.documentWidth = document.documentElement.clientWidth;
            this.resizeEvent = setTimeout(this.updateGraph, 300);
        },

        /**
         * Emits an empty selection when the canvas only is selected
         */
        canvasClicked(): void {
            if (this.nodeSelected) {
                this.nodeSelected = false;
                return;
            }
            this.selectedNode = null;
            this.updateData();
            this.updateGraph(0.01);
            this.$emit('onClearNodeSelected');
            this.selections.graph.selectAll('circle').classed('selected', false);
        },

        /**
         * Zoom handler for zooming the canvas
         *
         * @param event The zooming event
         */
        zoomed(event: D3ZoomEvent<SVGGraphicsElement, unknown>) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const transform = event.transform as any;
            this.selections.graph.attr('transform', transform);

            // Define some world boundaries based on the graph total size
            // so we don't scroll indefinitely
            const graphBox = this.selections.graph.node()?.getBBox();

            if (graphBox) {
                const margin = 500;
                const worldTopLeft = [graphBox.x - margin, graphBox.y - margin];
                const worldBottomRight = [graphBox.x + graphBox.width + margin, graphBox.y + graphBox.height + margin];
                this.zoom.translateExtent([worldTopLeft, worldBottomRight]);
            }
        },

        /**
         * Drag started handler for a node
         *
         * @param event The drag event
         * @param d The node
         */
        dragStart(event: D3DragEvent<SVGCircleElement, unknown, unknown>, d: VisualPatentNode) {
            this.selections.tooltip.style('visibility', 'hidden');

            if (event.active) {
                this.simulation?.alphaTarget(0.3).restart();
            }

            this.dragActive = true;

            d.fx = d.x;
            d.fy = d.y;

            this.nodeClick({} as PointerEvent, d);
        },

        /**
         * Drag handler for a node
         *
         * @param event The dragged event
         * @param d The node
         */
        dragged(event: DragEvent, d: VisualPatentNode) {
            d.fx = event.x;
            d.fy = event.y;

            this.mouseMove(event);

            // restart the simulation for the tick function to be called again
            this.simulation?.alphaTarget(0.01).restart();
        },

        /**
         * Drag-end handler for a node
         *
         * @param event The drop event
         * @param d The node
         */
        drop(event: D3DragEvent<SVGCircleElement, unknown, unknown>, d: VisualPatentNode) {
            if (!event.active) {
                this.simulation?.alphaTarget(0.0001);
            }
            d.fx = null;
            d.fy = null;
        },

        /**
         * Called when the mouse is moved over a node
         *
         * @param event The mouse event
         * @param node  The node
         */
        mouseOver(event: MouseEvent, node: VisualPatentNode) {
            // set current node to the value of the hovered node
            this.currentNode = node;

            // get related items and highlight them on hovering
            const graph = this.selections.graph;
            const circle = graph.selectAll('circle');
            const path = graph.selectAll<SVGPathElement, VisualPatentLink<VisualPatentNode>>('path');

            const related: VisualPatentNode[] = [node];
            const relatedLinks = [];

            this.graph.links.forEach((link) => {
                if (link.source === node || link.target === node) {
                    relatedLinks.push(link);
                    if (related.indexOf(link.source as VisualPatentNode) === -1) {
                        related.push(link.source as VisualPatentNode);
                    }
                    if (related.indexOf(link.target as VisualPatentNode) === -1) {
                        related.push(link.target as VisualPatentNode);
                    }
                }
            });

            circle.classed('faded', true);
            circle.filter((df) => related.indexOf(df as VisualPatentNode) > -1).classed('highlight', true);
            path.classed('faded-link', true);
            path.filter((df) => df.source === node || df.target === node).classed('highlight', true);

            this.selections.tooltip.style('visibility', 'visible');
            this.mouseMove(event);

            // This ensures that tick is called so the node count is updated
            this.simulation?.alphaTarget(0.001).restart();
        },

        /**
         * Event handler for the 'mousemove' event on a node. It will move the tooltip relative to the current mouse
         * position
         *
         * @param e The mouse event
         */
        mouseMove(e: MouseEvent): void {
            this.selections.tooltip
                .style('top', `${Math.max(0, e.pageY - 100)}px`)
                .style('left', `${Math.max(e.pageX - 200, 0)}px`);
        },

        /**
         * Event handler for the 'out' event on a node. It will hide the tooltip and reset the classes of the items
         * in the canvas
         */
        mouseOut() {
            // hide tooltip
            this.selections.tooltip.style('visibility', 'hidden');

            const graph = this.selections.graph;
            const circle = graph.selectAll('circle');
            const path = graph.selectAll('path');

            // reset classes for nodes and paths
            circle.classed('faded', false);
            circle.classed('highlight', false);
            path.classed('faded-link', false);
            path.classed('highlight', false);

            this.nodeSelected = false;
            this.simulation?.restart();
        },

        /**
         * Selects the clicked node
         *
         * @param event The click event
         * @param node  The node
         */
        nodeClick(event: PointerEvent, node: VisualPatentNode) {
            this.$emit('onNodeSelected', { node: node });

            // in order to prevent a canvas event to be triggered specify that a node is selected
            this.selectedNode = node;
            this.nodeSelected = true;

            this.updateData();
            this.updateGraph(0.01);
        },

        /**
         * Updates the forces based on the config
         */
        updateForces() {
            const { simulation, forceProperties, width, height } = this;
            simulation?.force(
                'center',
                forceCenter(width * forceProperties.center.x, height * forceProperties.center.y),
            );

            simulation?.force(
                'charge',
                forceManyBody()
                    .strength(forceProperties.charge.strength * (forceProperties.charge.enabled ? 1 : 0))
                    .distanceMin(forceProperties.charge.distanceMin)
                    .distanceMax(forceProperties.charge.distanceMax),
            );

            simulation?.force(
                'collide',
                forceCollide()
                    .strength(forceProperties.collide.strength * (forceProperties.charge.enabled ? 1 : 0))
                    .radius(forceProperties.collide.radius)
                    .iterations(forceProperties.collide.iterations),
            );

            simulation?.force(
                'forceX',
                forceX(width * forceProperties.forceX.x).strength(
                    forceProperties.forceX.strength * (forceProperties.charge.enabled ? 1 : 0),
                ),
            );

            simulation?.force(
                'forceY',
                forceY(height * forceProperties.forceY.y).strength(
                    forceProperties.forceY.strength * (forceProperties.forceY.enabled ? 1 : 0),
                ),
            );

            simulation?.force(
                'link',
                forceLink().distance(forceProperties.link.distance).iterations(forceProperties.link.iterations),
            );

            // updates ignored until this is run
            // restarts the simulation (important if simulation has already slowed down)
            simulation?.alpha(2).restart();
        },

        /**
         * Highlights border color of a node, once node or preview cards are viewed. Some preview is shown without node click
         */
        highlightOnPreview(nodeID: string, nodeType: string): void {
            // reset highlight
            if (!this.selections.graph) return;
            this.selections.graph.selectAll('circle').classed('selected', false);

            // find node in preview
            const target = this.selections.graph
                .selectAll<SVGSVGElement, VisualPatentNode>('circle')
                .filter((d: VisualPatentNode) => d.type === nodeType)
                .filter((d: VisualPatentNode) => d.id === nodeID);

            //highlight it
            target.classed('selected', true);
        },

        /**
         * Any clicked node should be highlighted
         */
        highlightOnClick(): void {
            // currently non-patents will not be marked as visited
            this.selections.graph
                .selectAll('circle')
                .classed('selected', false)
                .filter((td) => td === this.selectedNode)
                .classed('selected', true);
        },

        /**
         * If patent clicked, it should get marked
         */
        setMarkOnClick(): void {
            //set mark once on viewed node
            this.$store.commit('ADD_MARK', {
                pID: this.selectedNode?.id,
                twice: false,
            });
        },

        /**
         * Once the visualization changes, the marks need to be set again
         */
        updateMarks(): void {
            if (!this.selections.graph) return;
            //show marks for viewed once
            const markedOnce = this.$store.state.markedOnce;

            markedOnce.forEach((e: string) => {
                this.selections.graph
                    .selectAll<SVGSVGElement, VisualPatentNode>('circle')
                    .filter((d: VisualPatentNode) => d.type === 'patent')
                    .filter((d: VisualPatentNode) => d.id === e)
                    // add a mark to indicate it has been viewed
                    .classed('markedOnce', true);
            });

            //show marks for viewed twice
            const markedTwice = this.$store.state.markedTwice;

            markedTwice.forEach((e: string) => {
                this.selections.graph
                    .selectAll<SVGSVGElement, VisualPatentNode>('circle')
                    .filter((d: VisualPatentNode) => d.type === 'patent')
                    .filter((d: VisualPatentNode) => d.id === e)
                    // add a mark to indicate it has been viewed
                    .classed('markedTwice', true);
            });
        },
    },
});
</script>

<style lang="scss">
@import '../styles/colors';

.d3-container {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    svg {
        height: 100%;
        width: 100%;
    }
}
.d3-container.updating {
    transition: all 0.5s;
    z-index: -1;
    opacity: 0.5;
}

.tooltip {
    position: absolute;
    visibility: hidden;
    z-index: 1000;
    pointer-events: none;
    top: 0;
    left: 0;
}

.faded-link,
.faded {
    opacity: 0.6;
    transition: 0.3s opacity;
}

.faded-link {
    opacity: 0.1 !important;
}

.highlight {
    opacity: 1 !important;
}

path.link {
    fill: none;
    stroke-width: 2px;
    stroke: black;
}

circle {
    fill: black;
    stroke: #191900;
    stroke-width: 1.5px;
}

circle.patent {
    fill: $brown;
    stroke: none;
}

circle.citation {
    fill: $green;
    stroke: none;
}

circle.family {
    fill: $purple;
    stroke: none;
}

circle.author {
    fill: $red;
    stroke: none;
}

circle.company {
    fill: $blue;
    stroke: none;
}

circle.selected {
    stroke: #0048ba !important;
    stroke-width: 6px !important;
    animation: selected 2s infinite alternate ease-in-out;
}

circle.markedOnce {
    fill: url(#markOnce) #cccccc;
    stroke: rgb(168, 133, 41);
    stroke-width: 6px;
}

circle.markedTwice {
    fill: url(#markTwice);
    stroke: rgb(168, 133, 41);
    stroke-width: 6px;
}
</style>
