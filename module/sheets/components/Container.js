import Component from './Component.js';
import templateFunctions from '../template-functions.js';
import { CustomItem } from '../../documents/item.js';

/**
 * Abstract container class
 * @abstract
 */
class Container extends Component {
    /**
     * Container contents
     * @type {Array<Component>}
     * @private
     */
    _contents;

    /**
     * Can container accept dropped components ?
     * @type {boolean}
     * @private
     */
    _droppable;

    static addWrapperOnTemplate = true;

    /**
     * Constructor
     * @param {Object} data Component data
     * @param {string} data.key Component key
     * @param {string|null} [data.tooltip] Component tooltip
     * @param {string} data.templateAddress Component address in template, i.e. component path from actor.system object
     * @param {Array<Component>} [data.contents=[]] Container contents
     * @param {boolean} [data.droppable=false] Can container accept dropped subtemplates ?
     * @param {string|null} [data.cssClass=null] Additional CSS class to apply at render
     * @param {Number} [data.role=0] Component minimum role
     * @param {Number} [data.permission=0] Component minimum permission
     * @param {string|null} [data.visibilityFormula=null] Component visibility formula
     * @param {Container|null} [data.parent=null] Component's container
     */
    constructor({
        key,
        tooltip = null,
        templateAddress,
        contents = [],
        droppable = false,
        cssClass = null,
        role = 0,
        permission = 0,
        visibilityFormula = null,
        parent = null
    }) {
        super({
            key: key,
            tooltip: tooltip,
            templateAddress: templateAddress,
            cssClass: cssClass,
            role: role,
            permission: permission,
            visibilityFormula: visibilityFormula,
            parent: parent
        });

        if (this.constructor === Container) {
            throw new TypeError('Abstract class "Container" cannot be instantiated directly');
        }

        this._contents = contents;
        this._droppable = droppable;
    }

    /**
     * Container contents
     * @return {Array<Component>}
     */
    get contents() {
        return this._contents;
    }

    /**
     * Can container accept dropped components ?
     * @type {boolean}
     * @private
     */
    get droppable() {
        return this._droppable;
    }

    /**
     * Renders contents component
     * @param {CustomActor} actor Rendered actor
     * @param {boolean} [isEditable=true] Is the component editable by the current user ?
     * @return {Promise<Array<JQuery<HTMLElement>>>} The jQuery elements holding the components
     */
    async renderContents(actor, isEditable = true) {
        let jqElts = [];

        for (let component of this._contents) {
            jqElts.push(await component.render(actor, isEditable));
        }

        return jqElts;
    }

    /**
     * Renders template controls
     * @param {CustomActor} actor Rendered actor
     * @param {Object} options Component adding options
     * @return {Promise<Array<JQuery<HTMLElement>>>} The jQuery element holding the component
     */
    async renderTemplateControls(actor, options = {}) {
        let containerControls = $('<div></div>');
        containerControls.addClass('custom-system-template-tab-controls');

        if (this.droppable) {
            containerControls.addClass('custom-system-droppable-container');

            containerControls
                .on('dragenter', (event) => {
                    event.stopPropagation();
                    event.preventDefault();

                    $('.custom-system-drop-target').remove();
                    containerControls.addClass('custom-system-template-dragged-over');
                })
                .on('dragover', (event) => {
                    event.stopPropagation();
                    event.preventDefault();

                    let sourceId = game.system.flags?.copiedComponent?.sourceId;

                    if (event.ctrlKey || sourceId !== actor.uuid) {
                        event.originalEvent.dataTransfer.dropEffect = 'copy';
                    } else {
                        event.originalEvent.dataTransfer.dropEffect = 'move';
                    }
                })
                .on('dragleave', (event) => {
                    containerControls.removeClass('custom-system-template-dragged-over');
                })
                .on('drop', async (event) => {
                    await this.dropOnComponent(actor, event, this, options);
                });
        }

        let addElement = $('<a></a>');
        addElement.addClass('item custom-system-template-tab-controls-add-element');
        addElement.attr('title', 'Add new element');
        addElement.append('<i class="fas fa-plus-circle custom-system-clickable custom-system-add-component"></i>');

        addElement.on('click', () => {
            this.openComponentEditor(actor, options);
        });

        containerControls.append(addElement);

        return containerControls;
    }

    /**
     * Opens component editor
     * @param {CustomActor} actor Rendered actor
     * @param {Object} options Component options
     * @param {Object} [options.defaultValues] Component default values
     * @param {Array} [options.allowedComponents] Allowed components
     */
    openComponentEditor(actor, options = {}) {
        // Open dialog to edit new component
        templateFunctions.component(
            (action, component) => {
                // This is called on dialog validation
                this.addNewComponent(actor, component, options);
            },
            { componentData: options.defaultValues, allowedComponents: options.allowedComponents, actor }
        );
    }

    /**
     * Adds new component to container
     * @param {CustomActor} actor Rendered actor
     * @param {Object|Array<Object>} component New component
     * @param {Object} options Component options
     * @param {Object} [options.defaultValues] Component default values
     * @param {Array} [options.allowedComponents] Allowed components
     * @param {Component} [options.insertBefore] Insert new component before this one. Default behaviour is to insert last.
     */
    async addNewComponent(actor, component, options = {}) {
        if (!Array.isArray(component)) {
            component = [component];
        }

        let actorKeys = actor.getKeys();

        for (let aComp of component) {
            if (actorKeys.has(aComp.key)) {
                let suffix = 1;
                let originalKey = aComp.key;

                do {
                    aComp.key = originalKey + '_copy' + suffix;
                    suffix++;
                } while (actorKeys.has(aComp.key));
            }
        }

        let splittingPoint = this._contents.length;

        if (options.hasOwnProperty('insertBefore') && options.insertBefore !== null) {
            let index = this._contents.indexOf(options.insertBefore);
            if (index > -1) {
                splittingPoint = index;
            }
        }

        let firstSlice = this._contents.slice(0, splittingPoint);
        let lastSlice = this._contents.slice(splittingPoint, this._contents.length);

        // Add component
        this._contents = firstSlice.concat(componentFactory.createComponents(component)).concat(lastSlice);

        await this.save(actor);
    }

    /**
     * Deletes component in the current Container. Does not save the template afterwards.
     * @param {CustomActor|CustomItem} actor
     * @param {Component} component
     */
    deleteComponent(actor, component) {
        this._contents = this._contents.filter((elt) => elt !== component);
    }

    /**
     * Replaces component in the current Container. Does not save the template afterwards.
     * @param {CustomActor|CustomItem} actor
     * @param {Component} oldComponent The component to be replaced
     * @param {Object} newComponent The JSON-definition of the component to replace with
     */
    replaceComponent(actor, oldComponent, newComponent) {
        const componentIndex = this._contents.indexOf(oldComponent);
        this._contents[componentIndex] = componentFactory.createComponents(newComponent);
    }

    /**
     * Sorts component after in the current Container. Does not save the template afterwards.
     * @param {CustomActor|CustomItem} actor
     * @param {Component} component
     */
    sortComponentAfter(actor, component) {
        const componentIndex = this._contents.indexOf(component);

        if (componentIndex < this._contents.length && componentIndex > -1) {
            this._contents[componentIndex] = this._contents[componentIndex + 1];
            this._contents[componentIndex + 1] = component;
        }
    }

    /**
     * Sorts component before in the current Container. Does not save the template afterwards.
     * @param {CustomActor|CustomItem} actor
     * @param {Component} component
     */
    sortComponentBefore(actor, component) {
        const componentIndex = this._contents.indexOf(component);

        if (componentIndex > 0) {
            this._contents[componentIndex] = this._contents[componentIndex - 1];
            this._contents[componentIndex - 1] = component;
        }
    }

    /**
     * Returns an array of all the component's keys in the Container
     * @returns {string[]}
     */
    getAllKeys() {
        let keys = [this.key];

        for (let component of this.contents) {
            if (component instanceof Container) {
                keys = keys.concat(component.getAllKeys());
            } else {
                keys.push(component.key);
            }
        }

        return keys;
    }

    /**
     * Returns serialized component
     * @override
     * @return {Object}
     */
    toJSON() {
        let jsonObj = super.toJSON();
        let contentsJSON = [];

        for (let component of this.contents) {
            // Handling Tables, which handle their contents themselves
            if (component instanceof Component) {
                contentsJSON.push(component.toJSON());
            }
        }

        return {
            ...jsonObj,
            contents: contentsJSON
        };
    }
}

/**
 * @ignore
 */
export default Container;
