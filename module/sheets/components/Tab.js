import Container from './Container.js';

/**
 * @ignore
 */
class Tab extends Container {
    /**
     * Tab name
     * @type {string}
     * @private
     */
    _name;

    /**
     * Tab constructor
     * @param {Object} data Component data
     * @param {string} [data.name=] Tab name
     * @param {string} data.key Tab key
     * @param {string|null} [data.tooltip] Tab tooltip
     * @param {string} data.templateAddress Component address in template, i.e. component path from actor.system object
     * @param {Array<Component>} [data.contents=[]] Container contents
     * @param {Number} [data.role=0] Component minimum role
     * @param {Number} [data.permission=0] Component minimum permission
     * @param {string|null} [data.visibilityFormula=null] Component visibility formula
     * @param {Container|null} [data.parent=null] Component's container
     */
    constructor({
        name = '',
        key,
        tooltip = null,
        templateAddress,
        contents = [],
        role = 0,
        permission = 0,
        visibilityFormula = null,
        parent = null
    }) {
        super({
            key: key,
            tooltip: tooltip,
            templateAddress: templateAddress,
            contents: contents,
            droppable: true,
            role: role,
            permission: permission,
            visibilityFormula: visibilityFormula,
            parent: parent
        });
        this._name = name;
    }

    /**
     * Tab name getter
     * @return {string}
     */
    get name() {
        return this._name;
    }

    /**
     * Renders component
     * @override
     * @param {CustomActor} actor
     * @param {boolean} [isEditable=true] Is the component editable by the current user ?
     * @return {Promise<jQuery>} The jQuery element holding the component
     */
    async _getElement(actor, isEditable = true, options = {}) {
        let jQElement = await super._getElement(actor, isEditable, options);

        jQElement.addClass('tab');
        jQElement.attr('data-tab', this.key);
        jQElement.attr('data-group', 'primary');

        let mainPanelElement = $('<div></div>');
        mainPanelElement.addClass('flexcol flex-group-center');

        mainPanelElement.append(await this.renderContents(actor, isEditable));

        if (actor.isTemplate) {
            mainPanelElement.append(await this.renderTemplateControls(actor));
        }

        jQElement.append(mainPanelElement);
        return jQElement;
    }

    /**
     * Returns serialized component
     * @override
     * @return {Object}
     */
    toJSON() {
        let jsonObj = super.toJSON();

        return {
            ...jsonObj,
            name: this.name,
            type: 'tab'
        };
    }

    /**
     * Creates Tab from JSON description
     * @override
     * @param {Object} json
     * @param {string} templateAddress
     * @param {Container|null} parent
     * @return {Tab}
     */
    static fromJSON(json, templateAddress, parent = null) {
        let tab = new Tab({
            name: json.name,
            key: json.key,
            tooltip: json.tooltip,
            templateAddress: templateAddress,
            contents: [],
            role: json.role,
            permission: json.permission,
            visibilityFormula: json.visibilityFormula,
            parent: parent
        });

        tab._contents = componentFactory.createComponents(json.contents, templateAddress + '.contents', tab);

        return tab;
    }

    /**
     * Gets pretty name for this component's type
     * @return {string} The pretty name
     * @throws {Error} If not implemented
     */
    static getPrettyName() {
        return 'Tab';
    }
}

/**
 * @ignore
 */
export default Tab;
