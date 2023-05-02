import { UncomputableError } from '../errors/errors.js';
import { applyModifiers, removeEmpty } from '../utils.js';
import Component from '../sheets/components/Component.js';

/**
 * Extend the base Actor document
 * @extends {Actor}
 */
export class CustomActor extends Actor {
    /**
     * Is this actor a Template ?
     * @return {boolean}
     */
    get isTemplate() {
        return this.type === '_template';
    }

    _onCreate(data, options, userId) {
        super._onCreate(data, options, userId);

        if (this.permission === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            if (!data.flags?.['custom-system-builder']?.version) {
                this.setFlag('custom-system-builder', 'version', game.system.version);
            }
        }
    }

    canOwnItem(newItem) {
        if (this.isTemplate) {
            return false;
        } else {
            if (newItem.type !== 'equippableItem') {
                return false;
            } else if (newItem.system.unique) {
                for (let ownedItem of this.items) {
                    if (ownedItem.getFlag('core', 'sourceId') === newItem.flags.core.sourceId) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    /**
     * @override
     * @ignore
     */
    prepareDerivedData() {
        this._prepareCharacterData();
    }

    /**
     * Prepare Character type specific data
     * @private
     */
    _prepareCharacterData() {
        if (this.type !== 'character') return;

        // Make modifications to system here.
        const system = this.system;

        // Computing item modifiers
        const modifierPropsByKey = {};

        for (let item of this.items) {
            if (item.system.modifiers) {
                for (let modifier of item.system.modifiers) {
                    if (!modifierPropsByKey[modifier.key]) {
                        modifierPropsByKey[modifier.key] = [];
                    }

                    modifier.value = ComputablePhrase.computeMessageStatic(modifier.formula, item.system.props, {
                        defaultValue: 0
                    });

                    modifierPropsByKey[modifier.key].push(modifier);
                }
            }
        }

        for (let effect of this.effects) {
            if (this.system.activeEffects[effect.getFlag('core', 'statusId')]) {
                for (let modifier of this.system.activeEffects[effect.getFlag('core', 'statusId')]) {
                    if (!modifierPropsByKey[modifier.key]) {
                        modifierPropsByKey[modifier.key] = [];
                    }

                    modifier.value = ComputablePhrase.computeMessageStatic(modifier.formula, this.system.props, {
                        defaultValue: 0
                    });

                    modifierPropsByKey[modifier.key].push(modifier);
                }
            }
        }

        // Computing all properties
        let computableProps = {};
        let attributeBars = system.attributeBar;

        // Computable properties are labels within tabs / header and hidden attributes
        let headerSpecialFields = this._fetchSpecialFields(system.header);

        computableProps = {
            ...computableProps,
            ...headerSpecialFields.computable
        };

        attributeBars = {
            ...attributeBars,
            ...headerSpecialFields.attributeBar
        };

        let bodySpecialFields = this._fetchSpecialFields(system.body);

        computableProps = {
            ...computableProps,
            ...bodySpecialFields.computable
        };

        attributeBars = {
            ...attributeBars,
            ...bodySpecialFields.attributeBar
        };

        for (let hidden of system.hidden) {
            computableProps[hidden.name] = hidden.value;
        }

        for (let prop in computableProps) {
            if (prop.includes('.')) {
                let [dynamicTableKey, dynamicTableField] = prop.split('.');

                for (let row in foundry.utils.getProperty(system.props, dynamicTableKey)) {
                    if (!foundry.utils.getProperty(system.props, dynamicTableKey + '.' + row).deleted) {
                        foundry.utils.setProperty(
                            system.props,
                            `${dynamicTableKey}.${row}.${dynamicTableField}`,
                            undefined
                        );
                    }
                }
            } else {
                foundry.utils.setProperty(system.props, prop, undefined);
            }
        }

        system.props = removeEmpty(system.props);

        let computedProps;
        let uncomputedProps = { ...computableProps };

        // Loop while all props are not computed
        // Some computed properties are used in other computed properties, so we need to make several passes to compute them all
        do {
            computedProps = {};

            // For each uncomputed property, we try compute it
            for (let prop in uncomputedProps) {
                try {
                    let newComputedRows = {};

                    if (prop.includes('.')) {
                        let [dynamicTableKey, dynamicTableField] = prop.split('.');

                        for (let row in foundry.utils.getProperty(system.props, dynamicTableKey)) {
                            if (!foundry.utils.getProperty(system.props, dynamicTableKey + '.' + row).deleted) {
                                foundry.utils.setProperty(
                                    newComputedRows,
                                    `${dynamicTableKey}.${row}.${dynamicTableField}`,
                                    ComputablePhrase.computeMessageStatic(uncomputedProps[prop], system.props, {
                                        reference: `${dynamicTableKey}.${row}`,
                                        availableKeys: Object.keys(computableProps)
                                    }).result
                                );
                            }
                        }
                    } else {
                        newComputedRows[prop] = ComputablePhrase.computeMessageStatic(
                            uncomputedProps[prop],
                            system.props,
                            {
                                availableKeys: Object.keys(computableProps)
                            }
                        ).result;

                        if (modifierPropsByKey[prop]) {
                            newComputedRows[prop] = applyModifiers(newComputedRows[prop], modifierPropsByKey[prop]);
                        }
                    }

                    // If successful, the property is added to computedProp and deleted from uncomputedProps
                    console.debug('Computed ' + prop + ' successfully !');
                    foundry.utils.mergeObject(computedProps, newComputedRows);
                    delete uncomputedProps[prop];
                } catch (err) {
                    if (err instanceof UncomputableError) {
                        console.debug(
                            'Passing prop ' + prop + ' (' + uncomputedProps[prop] + ') to next round of computation...'
                        );
                    } else {
                        throw err;
                    }
                }
            }

            console.log({
                message:
                    'Computed props for ' +
                    this.name +
                    ' - ' +
                    Object.keys(computedProps).length +
                    ' / ' +
                    Object.keys(uncomputedProps).length,
                computedProps: computedProps,
                leftToCompute: uncomputedProps
            });

            // We add the props computed in this loop to the actor's system
            system.props = foundry.utils.mergeObject(system.props, computedProps);
        } while (
            // If no uncomputed props are left, we computed everything, and we can stop
            // If computedProps is empty, that means nothing was computed in this loop, and there is an error in the property definitions
            // Probably a wrongly defined formula, or a loop in property definition
            Object.keys(uncomputedProps).length > 0 &&
            Object.keys(computedProps).length > 0
        );

        // We log the remaining uncomputable properties for debug
        if (Object.keys(uncomputedProps).length > 0) {
            console.warn('Some props were not computed.');
            console.warn(uncomputedProps);
        }

        for (let prop in attributeBars) {
            // Attribute bars can not be taken from dynamic tables
            if (!prop.includes('.')) {
                let max = attributeBars[prop].max;
                if (Number.isNaN(Number(max))) {
                    max = ComputablePhrase.computeMessageStatic(max ?? '0', system.props, { defaultValue: 0 }).result;
                }

                let value = attributeBars[prop].value ?? foundry.utils.getProperty(system.props, prop);
                if (Number.isNaN(Number(value))) {
                    value = ComputablePhrase.computeMessageStatic(value ?? '0', system.props, {
                        defaultValue: 0
                    }).result;
                }

                foundry.utils.setProperty(system.attributeBar, prop, {
                    value: value,
                    max: max,
                    key: prop
                });
            }
        }
    }

    /**
     * @ignore
     * @override
     */
    getRollData() {
        if (this.type !== 'character') return;

        // Prepare character roll data.
        const data = this._getCharacterRollData(super.getRollData());
        data.name = this.name;

        return data;
    }

    /**
     * @ignore
     * @override
     */
    async getTokenDocument(data = {}) {
        if (this.type !== 'character') return;

        let tokenData = foundry.utils.deepClone(await super.getTokenDocument(data));
        const rollData = this.getRollData();

        // Prepare character roll data.
        tokenData = foundry.utils.mergeObject(tokenData, this._getCharacterRollData(rollData));

        return tokenData;
    }

    /**
     * @ignore
     * Handle how changes to a Token attribute bar are applied to the Actor.
     * @param {string} attribute    The attribute path
     * @param {number} value        The target attribute value
     * @param {boolean} isDelta     Whether the number represents a relative change (true) or an absolute change (false)
     * @param {boolean} isBar       Whether the new value is part of an attribute bar, or just a direct value
     * @returns {Promise<documents.Actor>}  The updated Actor document
     */
    async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
        const current = foundry.utils.getProperty(this.system, attribute);

        if (isBar && attribute.startsWith('attributeBar')) {
            let barDefinition = foundry.utils.getProperty(this.system, attribute);
            if (barDefinition) {
                if (isDelta) value = Number(current.value) + value;

                value = Math.clamped(0, value, barDefinition.max);
                attribute = 'props.' + barDefinition.key;
                isBar = false;
                isDelta = false;
            }
        }

        return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
    }

    /**
     * Prepare character roll data.
     * @private
     */
    _getCharacterRollData(systemData = {}) {
        if (this.type !== 'character') return;

        const rollData = foundry.utils.deepClone(systemData);

        if (rollData.props) {
            for (let [k, v] of Object.entries(rollData.props)) {
                rollData[k] = foundry.utils.deepClone(v);
            }
        }

        if (rollData.body) {
            delete rollData.body;
        }
        if (rollData.header) {
            delete rollData.header;
        }
        if (rollData.hidden) {
            delete rollData.hidden;
        }
        if (rollData.display) {
            delete rollData.display;
        }
        if (rollData.template) {
            delete rollData.template;
        }

        return rollData;
    }

    /**
     * Rolls a template's defined roll with this Character properties
     * @param {string} rollKey The key of the Component holding the roll
     * @param {Object} [options={}] Roll options
     * @param {boolean} [options.postMessage=true] If the roll should be automatically posted as a Chat Message
     * @returns {Promise<ComputablePhrase>} The computed roll
     * @throws {Error} If the key does not have a roll
     */
    async roll(rollKey, options = {}) {
        let { postMessage = true, alternative = false } = options;
        let refRoll = rollKey.split('.');
        let reference = null;
        let [filterMatch, parentProp, filterProp, filterValue] =
            refRoll.shift().match(/^([a-zA-Z0-9_]+)\(([a-zA-Z0-9_]+)=(.+)\)$/) ?? [];

        if (filterMatch) {
            let parent = foundry.utils.getProperty(this.getRollData(), parentProp);

            let index = Object.keys(parent).filter((key) => parent[key][filterProp] === filterValue)[0];

            if (!index) {
                throw new Error('Roll formula not found in character sheet');
            }

            reference = parentProp + '.' + index;
            rollKey = parentProp + '.' + refRoll.join('.');
        }

        let rollType = alternative ? 'alternative' : 'main';

        // Recovering value from data
        let rollText = this.getCustomRolls()[rollType][rollKey];

        if (rollText) {
            let phrase = new ComputablePhrase(rollText);
            await phrase.compute(this.system.props, {
                reference: reference,
                computeExplanation: true
            });

            if (postMessage) {
                let speakerData = ChatMessage.getSpeaker({
                    actor: this,
                    token: this.getActiveTokens()?.[0]?.document,
                    scene: game.scenes.current
                });

                phrase.postMessage({
                    speaker: speakerData
                });
            }

            return phrase;
        } else {
            throw new Error('Roll formula not found in character sheet');
        }
    }

    /**
     * Gets all custom rolls defined in the character's template
     * @returns {Object}}
     */
    getCustomRolls() {
        // Computing all properties
        let customRolls = {
            main: {},
            alternative: {}
        };

        // Computable properties are labels within tabs / header and hidden attributes
        let headerRolls = this._fetchSpecialFields(this.system.header);

        customRolls.main = {
            ...customRolls.main,
            ...headerRolls.rollable
        };

        customRolls.alternative = {
            ...customRolls.alternative,
            ...headerRolls.altRollable
        };

        let bodyRolls = this._fetchSpecialFields(this.system.body);
        customRolls.main = {
            ...customRolls.main,
            ...bodyRolls.rollable
        };

        customRolls.alternative = {
            ...customRolls.alternative,
            ...bodyRolls.altRollable
        };

        return customRolls;
    }

    /**
     * Gets all special fields in a given component, and returns :
     * - computable and their formula
     * - rollable and their rollMessages
     * - attribute bars and their maximum value
     * @param {Component} component The root component to extract fields from
     * @param {Object} specialFieldList The combined list of special fields and info
     * @param {Object} specialFieldList.rollable The list of Rollable fields
     * @param {Object} specialFieldList.computable The list of Computable fields
     * @param {Object} specialFieldList.attributeBar The list of Attribute Bars
     * @param {Object} specialFieldList.keyedProperties The list of keyed properties in the template
     * @param {string} keyPrefix The prefix to add to a key, if needed
     * @return {Object} The combined list of special fields and info
     * @private
     */
    _fetchSpecialFields(
        component,
        specialFieldList = { rollable: {}, altRollable: {}, attributeBar: {}, computable: {}, keyedProperties: [] },
        keyPrefix = ''
    ) {
        if (component) {
            // Handling the table case, where the contents list is an Array of Arrays
            if (Array.isArray(component)) {
                for (let subComp of component) {
                    let subSpecialList = this._fetchSpecialFields(subComp, specialFieldList, keyPrefix);
                    specialFieldList = {
                        ...specialFieldList,
                        ...subSpecialList
                    };
                }
            } else {
                // Component needs key to be relevant
                if (component.key) {
                    if (component.rollMessage) {
                        specialFieldList.rollable[keyPrefix + component.key] = component.rollMessage;
                    }

                    if (component.altRollMessage) {
                        specialFieldList.altRollable[keyPrefix + component.key] = component.altRollMessage;
                    }

                    if (component.value) {
                        specialFieldList.computable[keyPrefix + component.key] = component.value;
                    }

                    if (component.maxVal) {
                        specialFieldList.attributeBar[keyPrefix + component.key] = { max: component.maxVal };
                    }

                    specialFieldList.keyedProperties.push(keyPrefix + component.key);
                }

                // Recurse on contents
                if (component.contents) {
                    let subSpecialList = this._fetchSpecialFields(component.contents, specialFieldList, keyPrefix);
                    specialFieldList = {
                        ...specialFieldList,
                        ...subSpecialList
                    };
                }
                // Recurse on dynamic tables
                if (component.rowLayout) {
                    let subSpecialList = this._fetchSpecialFields(
                        component.rowLayout,
                        specialFieldList,
                        keyPrefix + component.key + '.'
                    );
                    specialFieldList = {
                        ...specialFieldList,
                        ...subSpecialList
                    };
                }
            }
        }

        return specialFieldList;
    }

    /**
     * Gets all keys in template, in a set
     * @return {Set} The set of keys
     */
    getKeys() {
        let keys = new Set();

        for (let hiddenProp of this.system.hidden) {
            keys.add(hiddenProp.name);
        }

        let keyedComponents = this.sheet.getTemplateKeys();

        for (let key of keyedComponents) {
            keys.add(key);
        }

        // Adding special key 'name', used by the field on top of the sheets.
        keys.add('name');

        return keys;
    }

    /**
     * Reloads this character templates, updating the component structure, and re-renders the sheet.
     * @param {string|null} [templateId=null] New template id. If not set, will reload the current template.
     */
    reloadTemplate(templateId = null) {
        templateId = templateId || this.system.template;

        const template = game.actors.get(templateId);

        for (let barName in this.system.attributeBar) {
            if (!template.system.attributeBar[barName]) {
                template.system.attributeBar['-=' + barName] = null;
            }
        }

        let availableKeys = template.getKeys();
        for (let prop in this.system.props) {
            if (!availableKeys.has(prop)) {
                this.system.props['-=' + prop] = true;
            }
        }

        this.sheet._hasBeenRenderedOnce = false;

        // Updates hidden properties, tabs & header data
        // Sheet rendering will handle the actual props creation
        this.update({
            system: {
                template: templateId,
                hidden: template.system.hidden,
                body: template.system.body,
                header: template.system.header,
                display: template.system.display,
                attributeBar: template.system.attributeBar,
                activeEffects: template.system.activeEffects,
                props: this.system.props
            }
        }).then(() => {
            console.debug('Updated !');
            this.sheet.render(false);
        });
    }

    /**
     * Deletes component located at specified address
     * @param componentAddress {String}
     */
    async deleteComponentFromSheet(componentAddress) {
        let workingAddress = componentAddress.split('.');

        let component;

        switch (workingAddress.shift()) {
            case 'body':
                component = this.sheet._customBody;
                break;
            case 'header':
                component = this.sheet._customHeader;
                break;
            default:
                throw new Error('Invalid address');
        }

        while (workingAddress.length > 0) {
            component = component[workingAddress.shift()];
        }

        if (!component instanceof Component) {
            throw new Error('Invalid address');
        } else {
            await component.delete(this);
        }
    }
}

Hooks.on('preCreateItem', (item, createData, options, userId) => {
    if (item.isOwned) {
        const actor = item.parent;
        if (!actor.canOwnItem(item)) return false; // prevent creation
    }
});
