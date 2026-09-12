import { GameEvent, WorldEntity, WorldState } from "../../types";

export class SpatialEngine {
  /**
   * Determines whether an entity is present in the current scene's location.
   */
  static isEntityInScene(
    entityId: string,
    entity: WorldEntity | undefined,
    world: WorldState
  ): boolean {
    if (!entity || !world?.scene?.location) {
      return false;
    }

    const sceneLoc = world.scene.location.trim().toLowerCase();

    // If entity has an explicit location
    if (typeof entity.location === "string" && entity.location.trim().length > 0) {
      const entLoc = entity.location.trim().toLowerCase();
      if (entLoc === sceneLoc) {
        return true;
      }
      // Support sub-locations (e.g., tavern_outside_window is part of tavern_outside)
      if (entLoc.startsWith(sceneLoc + "_") || sceneLoc.startsWith(entLoc + "_")) {
        return true;
      }
      return false;
    }

    // Characters or objects without explicit location are considered absent from scene
    return false;
  }

  /**
   * Evaluates if an entity can potentially perceive or observe a given event.
   */
  static canPotentiallyObserveEvent(
    entityId: string,
    entity: WorldEntity | undefined,
    event: GameEvent,
    world: WorldState
  ): boolean {
    if (!this.isEntityInScene(entityId, entity, world)) {
      return false;
    }

    // If event target is explicitly another entity in a private scope or out of sight
    if (event.details?.isPrivate && event.target && event.target !== entityId && event.actor !== entityId) {
      return false;
    }

    return true;
  }

  /**
   * Retrieves all characters currently present in the active scene.
   */
  static getSceneCharacters(
    world: WorldState,
    includePlayer = false
  ): Array<{ id: string; entity: WorldEntity }> {
    if (!world?.entities) return [];

    const characters: Array<{ id: string; entity: WorldEntity }> = [];
    for (const [id, entity] of Object.entries(world.entities)) {
      if (entity.type === "character") {
        if (!includePlayer && id === "player") {
          continue;
        }
        if (this.isEntityInScene(id, entity, world)) {
          characters.push({ id, entity });
        }
      }
    }

    return characters;
  }
}
